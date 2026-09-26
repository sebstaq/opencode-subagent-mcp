import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentDefinition } from "./agents.js";
import { toOpencodeTools } from "./agents.js";
import { parseModel, type Config } from "./config.js";
import type {
  MessageWithParts,
  OpencodeClient,
  OpencodeEvent,
  PromptBody,
  SessionInfo,
  SessionStatus,
} from "./opencode/client.js";
import { buildRuleset, loadClaudePermissions, type PermissionMode } from "./permissions.js";
import {
  createWorktree,
  finalizeWorktree,
  type Worktree,
  type WorktreeOutcome,
} from "./worktree.js";

/** Longest provider backoff to sit through before failing the run instead. */
const MAX_RETRY_BACKOFF_MS = 2 * 60_000;

export type JobStatus = "running" | "completed" | "failed" | "stopped" | "max_turns";

export interface PermissionRequest {
  id: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
}

export type PermissionReply = { reply: "once" | "always" | "reject"; message?: string };

/** Bridges opencode to the MCP client: permission prompts and progress lines. */
export interface Host {
  askPermission(job: Job, request: PermissionRequest): Promise<PermissionReply>;
}

export interface Usage {
  cost: number;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface RunResult {
  agentId: string;
  status: JobStatus;
  text: string;
  structured?: unknown;
  error?: string;
  turns: number;
  usage: Usage;
  model: string;
  durationMs: number;
  worktree?: WorktreeOutcome;
  fullOutputPath?: string;
}

export interface StartOptions {
  description: string;
  prompt: string;
  cwd: string;
  definition?: AgentDefinition;
  /** opencode agent (`general`, `explore`, `build`, `plan`, or a user-defined one). */
  opencodeAgent?: string;
  model?: string;
  permissionMode?: PermissionMode;
  isolation?: "worktree";
  tools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  effort?: string;
  schema?: Record<string, unknown>;
}

/** Tools subagents never get, matching native behaviour (no nested agents, no user questions). */
const ALWAYS_DISABLED = ["task", "question"];

export class Job {
  readonly id: string;
  status: JobStatus = "running";
  turns = 0;
  readonly startedAt = Date.now();
  finishedAt?: number;
  result?: RunResult;
  /** Progress sink of whichever MCP call is currently waiting on this job. */
  onProgress?: (message: string) => void;

  /** Server-side creation time floor for messages that belong to the current run. */
  promptedAt = 0;
  /** Session usage totals before the current run; usage is reported as the delta. */
  usageBase: Usage = emptyUsage();
  maxTurns?: number;
  hitMaxTurns = false;
  stopped = false;
  lastError?: string;
  readonly seenParts = new Set<string>();
  private settle!: (r: RunResult) => void;
  done!: Promise<RunResult>;

  constructor(
    id: string,
    readonly description: string,
    public directory: string,
    readonly model: string,
    readonly permissionMode: PermissionMode,
    readonly prompt: Omit<PromptBody, "parts">,
    readonly ruleset: ReturnType<typeof buildRuleset>,
    public worktree?: Worktree,
    readonly repoCwd?: string,
  ) {
    this.id = id;
    this.reset();
  }

  reset(): void {
    this.status = "running";
    this.turns = 0;
    this.hitMaxTurns = false;
    this.stopped = false;
    this.lastError = undefined;
    this.finishedAt = undefined;
    this.done = new Promise((resolve) => (this.settle = resolve));
  }

  finish(result: RunResult): void {
    this.status = result.status;
    this.result = result;
    this.finishedAt = Date.now();
    this.settle(result);
  }
}

export class Runner {
  private readonly jobs = new Map<string, Job>();
  /** Session id (including opencode child sessions) → owning job. */
  private readonly owners = new Map<string, Job>();
  private readonly handledPermissions = new Set<string>();
  private readonly finalizing = new Set<string>();
  private poller?: NodeJS.Timeout;

  constructor(
    private readonly config: Config,
    private readonly client: () => Promise<OpencodeClient>,
    private readonly host: Host,
  ) {}

  list(): Job[] {
    return [...this.jobs.values()];
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  private running(): number {
    return this.list().filter((j) => j.status === "running").length;
  }

  async start(opts: StartOptions): Promise<Job> {
    if (this.running() >= this.config.maxConcurrent) {
      throw new Error(`too many running agents (maxConcurrent=${this.config.maxConcurrent})`);
    }
    const oc = await this.client();
    const def = opts.definition;
    const isolation = opts.isolation ?? def?.isolation;
    const mode = opts.permissionMode ?? def?.permissionMode ?? this.config.defaultPermissionMode;
    const model = opts.model ?? def?.model ?? this.config.defaultModel;

    const worktree = isolation
      ? await createWorktree(opts.cwd, `agent-${randomBytes(4).toString("hex")}`)
      : undefined;
    const directory = worktree?.cwd ?? opts.cwd;

    const ruleset = buildRuleset({
      mode,
      claude: await loadClaudePermissions(worktree?.repoRoot ?? opts.cwd),
      isolated: Boolean(worktree),
      disallowedTools: await this.deniedPermissions(oc, directory, {
        allow: opts.tools ?? def?.tools,
        deny: [...(def?.disallowedTools ?? []), ...(opts.disallowedTools ?? [])],
      }),
    });

    const system = [
      def?.prompt,
      worktree &&
        `You are working in an isolated git worktree at ${worktree.path} (branch ${worktree.branch}, ` +
          `based on ${worktree.baseRef}). Stay inside it. Commit your work there when it is complete.`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const session = await oc.createSession(directory, {
      title: opts.description,
      permission: ruleset,
    });
    const prompt: Omit<PromptBody, "parts"> = {
      model: parseModel(model),
      agent: opts.opencodeAgent ?? "general",
      ...(system && { system }),
      ...((opts.effort ?? def?.effort) && { variant: opts.effort ?? def?.effort }),
      ...(opts.schema && {
        format: { type: "json_schema" as const, schema: opts.schema, retryCount: 2 },
      }),
    };
    const job = new Job(
      session.id,
      opts.description,
      directory,
      model,
      mode,
      prompt,
      ruleset,
      worktree,
      opts.cwd,
    );
    job.maxTurns = opts.maxTurns ?? def?.maxTurns;
    this.jobs.set(job.id, job);
    this.owners.set(job.id, job);
    await this.send(job, opts.prompt);
    return job;
  }

  /** Resumes an agent with a new message, keeping its full history (SendMessage parity). */
  async resume(agentId: string, message: string, maxTurns?: number): Promise<Job> {
    let job = this.jobs.get(agentId);
    const oc = await this.client();
    if (!job) {
      // Session from an earlier MCP process: opencode still has it on disk.
      const session = await oc.getSession(agentId);
      const mode = this.config.defaultPermissionMode;
      const ruleset = buildRuleset({
        mode,
        claude: await loadClaudePermissions(session.directory),
        isolated: false,
        disallowedTools: ALWAYS_DISABLED,
      });
      job = new Job(
        session.id,
        session.title,
        session.directory,
        this.config.defaultModel,
        mode,
        {
          model: parseModel(this.config.defaultModel),
          agent: "general",
        },
        ruleset,
      );
      this.jobs.set(job.id, job);
      this.owners.set(job.id, job);
    } else if (job.status === "running") {
      throw new Error(`agent ${agentId} is still running; wait for it or stop it first`);
    }
    if (job.worktree && !job.result?.worktree?.kept) {
      // The worktree was cleaned up because it had no changes; give the agent a fresh one.
      job.worktree = await createWorktree(
        job.repoCwd ?? job.worktree.repoRoot,
        job.worktree.path.split("/").pop()!,
      );
      job.directory = job.worktree.cwd;
    }
    job.reset();
    job.maxTurns = maxTurns ?? job.maxTurns;
    await this.send(job, message);
    return job;
  }

  private async send(job: Job, text: string): Promise<void> {
    const oc = await this.client();
    job.usageBase = sessionUsage(await oc.getSession(job.id));
    job.promptedAt = Date.now() - 1_000;
    this.ensurePoller();
    try {
      await oc.promptAsync(job.directory, job.id, {
        ...job.prompt,
        parts: [{ type: "text", text }],
      });
    } catch (err) {
      await this.complete(job, (err as Error).message);
    }
  }

  async stop(agentId: string): Promise<Job> {
    const job = this.jobs.get(agentId);
    if (!job) throw new Error(`unknown agent ${agentId}`);
    if (job.status === "running") {
      job.stopped = true;
      await (await this.client()).abort(job.directory, job.id);
      await this.complete(job);
    }
    return job;
  }

  /**
   * Turns Claude-style tool allow/deny lists into opencode permissions to deny outright.
   * opencode hides a tool whose permission is denied for every pattern. (The per-prompt
   * `tools` map is not used: it is deprecated and replaces the session's permission rules
   * instead of merging, see opencode#35647 and #17607.)
   */
  private async deniedPermissions(
    oc: OpencodeClient,
    directory: string,
    lists: { allow?: string[]; deny: string[] },
  ): Promise<string[]> {
    const denied = new Set([...toOpencodeTools(lists.deny), ...ALWAYS_DISABLED].map(permissionOf));
    if (lists.allow?.length) {
      const allowed = new Set(toOpencodeTools(lists.allow).map(permissionOf));
      for (const id of await oc.toolIds(directory)) {
        const perm = permissionOf(id);
        if (!allowed.has(perm)) denied.add(perm);
      }
    }
    return [...denied];
  }

  // ---- event handling -------------------------------------------------------------------

  handleEvent(event: OpencodeEvent): void {
    const props = event.properties;
    switch (event.type) {
      case "session.created":
      case "session.updated": {
        const info = props.info as { id?: string; parentID?: string } | undefined;
        const parent = info?.parentID && this.owners.get(info.parentID);
        if (info?.id && parent) this.owners.set(info.id, parent);
        return;
      }
      case "permission.asked":
        void this.handlePermission(props as unknown as PermissionRequest & { sessionID: string });
        return;
      case "message.part.updated":
        this.handlePart(props as { sessionID: string; part: MessageWithParts["parts"][number] });
        return;
      case "session.error": {
        const job = this.owners.get(props.sessionID as string);
        const err = props.error as { name?: string; data?: { message?: string } } | undefined;
        if (job && job.id === props.sessionID && err && err.name !== "MessageAbortedError") {
          job.lastError = err.data?.message ?? err.name;
        }
        return;
      }
      case "session.idle":
        this.maybeComplete(props.sessionID as string);
        return;
      case "session.status": {
        const status = props.status as SessionStatus | undefined;
        if (status?.type === "idle") this.maybeComplete(props.sessionID as string);
        if (status?.type === "retry") this.handleRetry(props.sessionID as string, status);
        return;
      }
    }
  }

  /** Called after the event stream (re)connects: pick up prompts and completions we missed. */
  async resync(): Promise<void> {
    for (const job of this.list()) {
      if (job.status === "running") this.maybeComplete(job.id);
    }
  }

  private handlePart(props: { sessionID: string; part: MessageWithParts["parts"][number] }): void {
    const job = this.owners.get(props.sessionID);
    if (!job || job.status !== "running") return;
    const part = props.part;
    if (part.type === "step-finish" && props.sessionID === job.id) {
      if (job.seenParts.has(part.id)) return;
      job.seenParts.add(part.id);
      job.turns++;
      if (job.maxTurns && job.turns >= job.maxTurns && !job.hitMaxTurns) {
        job.hitMaxTurns = true;
        void this.client().then((oc) => oc.abort(job.directory, job.id));
      }
      return;
    }
    if (part.type === "tool" && part.state) {
      const key = `${part.id}:${part.state.status}`;
      if (job.seenParts.has(key)) return;
      if (part.state.status !== "running" && part.state.status !== "error") return;
      job.seenParts.add(key);
      const detail = part.state.title || summarizeInput(part.state.input);
      job.onProgress?.(
        `${part.tool}${detail ? `: ${detail}` : ""}${part.state.status === "error" ? " (failed)" : ""}`,
      );
    }
  }

  private async handlePermission(req: PermissionRequest & { sessionID: string }): Promise<void> {
    const job = this.owners.get(req.sessionID);
    if (!job || this.handledPermissions.has(req.id)) return;
    this.handledPermissions.add(req.id);
    let reply: PermissionReply;
    try {
      reply = await this.host.askPermission(job, req);
    } catch (err) {
      reply = {
        reply: "reject",
        message: `Permission prompt unavailable: ${(err as Error).message}`,
      };
    }
    try {
      await (
        await this.client()
      ).replyPermission(job.directory, req.id, reply.reply, reply.message);
    } catch {
      // The request may already be gone (session aborted); nothing to do.
    }
  }

  private ensurePoller(): void {
    if (this.poller) return;
    // Safety net for missed idle events: SSE can drop between reconnects.
    this.poller = setInterval(() => {
      const running = this.list().filter((j) => j.status === "running");
      if (!running.length) {
        clearInterval(this.poller);
        this.poller = undefined;
        return;
      }
      for (const job of running) this.maybeComplete(job.id);
    }, 15_000);
    this.poller.unref();
  }

  private maybeComplete(sessionID: string): void {
    const job = this.jobs.get(sessionID);
    if (!job || job.status !== "running" || this.finalizing.has(job.id)) return;
    this.finalizing.add(job.id);
    void (async () => {
      try {
        const oc = await this.client();
        const busy = (await oc.status(job.directory))[job.id];
        if (busy?.type === "retry") {
          this.finalizing.delete(job.id);
          this.handleRetry(job.id, busy);
          return;
        }
        if (busy && busy.type !== "idle") return;
        const messages = await this.runMessages(oc, job);
        const last = messages.at(-1);
        const settled =
          last?.info.role === "assistant" && (last.info.time?.completed || last.info.error);
        if (!settled && !job.stopped) return;
        await this.complete(job, undefined, messages);
      } catch {
        // Retry on the next idle event or poll.
      } finally {
        this.finalizing.delete(job.id);
      }
    })();
  }

  /**
   * opencode retries provider errors on its own, silently and for as long as the provider
   * asks. Short backoffs are reported as progress; errors that need the user (an exhausted
   * subscription limit) or a long backoff fail the run so the caller can fall back.
   */
  private handleRetry(sessionID: string, status: Extract<SessionStatus, { type: "retry" }>): void {
    const job = this.jobs.get(sessionID);
    if (!job || job.status !== "running" || job.stopped || this.finalizing.has(job.id)) return;
    const message = status.message ?? "provider error";
    const backoff = (status.next ?? 0) - Date.now();
    if (!status.action?.reason && backoff <= MAX_RETRY_BACKOFF_MS) {
      job.onProgress?.(
        `retrying after a provider error (attempt ${status.attempt ?? 1}): ${message}`,
      );
      return;
    }
    this.finalizing.add(job.id);
    void (async () => {
      try {
        const oc = await this.client();
        await oc.abort(job.directory, job.id).catch(() => undefined);
        await this.complete(
          job,
          `The model provider is unavailable: ${message}. Retry later or use a native subagent.`,
        );
      } finally {
        this.finalizing.delete(job.id);
      }
    })();
  }

  private async runMessages(oc: OpencodeClient, job: Job): Promise<MessageWithParts[]> {
    const recent = await oc.recentMessages(job.directory, job.id);
    return recent.filter((m) => (m.info.time?.created ?? 0) >= job.promptedAt);
  }

  private async complete(job: Job, failure?: string, messages?: MessageWithParts[]): Promise<void> {
    if (job.status !== "running") return;
    const oc = await this.client();
    messages ??= await this.runMessages(oc, job).catch(() => []);
    const assistant = messages.filter((m) => m.info.role === "assistant");
    const total = await oc
      .getSession(job.id)
      .then(sessionUsage)
      .catch(() => job.usageBase);
    const usage = Object.fromEntries(
      Object.entries(total).map(([k, v]) => [k, v - job.usageBase[k as keyof Usage]]),
    ) as unknown as Usage;
    let text = "";
    for (const m of assistant.toReversed()) {
      text = m.parts
        .filter((p) => p.type === "text" && !p.synthetic && p.text)
        .map((p) => p.text)
        .join("\n")
        .trim();
      if (text) break;
    }
    const last = assistant.at(-1)?.info;
    const structured = assistant.toReversed().find((m) => m.info.structured !== undefined)
      ?.info.structured;
    const aborted = last?.error?.name === "MessageAbortedError";
    const errorText =
      failure ??
      (aborted ? undefined : (last?.error?.data?.message ?? last?.error?.name)) ??
      job.lastError;

    const status: JobStatus = job.stopped
      ? "stopped"
      : job.hitMaxTurns
        ? "max_turns"
        : errorText && !text
          ? "failed"
          : "completed";

    let worktree: WorktreeOutcome | undefined;
    if (job.worktree) {
      worktree = await finalizeWorktree(job.worktree).catch(() => undefined);
    }

    let fullOutputPath: string | undefined;
    if (text.length > this.config.maxResultChars) {
      const dir = join(tmpdir(), "opencode-subagent-mcp");
      await mkdir(dir, { recursive: true });
      fullOutputPath = join(dir, `${job.id}-${Date.now()}.md`);
      await writeFile(fullOutputPath, text);
      text = `${text.slice(0, this.config.maxResultChars)}\n\n[truncated; full output: ${fullOutputPath}]`;
    }

    job.finish({
      agentId: job.id,
      status,
      text,
      ...(structured !== undefined && { structured }),
      ...(errorText && { error: errorText }),
      turns: job.turns,
      usage,
      model: last?.providerID && last.modelID ? `${last.providerID}/${last.modelID}` : job.model,
      durationMs: Date.now() - job.startedAt,
      ...(worktree && { worktree }),
      ...(fullOutputPath && { fullOutputPath }),
    });
  }
}

function emptyUsage(): Usage {
  return { cost: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
}

function sessionUsage(s: SessionInfo): Usage {
  return {
    cost: s.cost ?? 0,
    input: s.tokens?.input ?? 0,
    output: s.tokens?.output ?? 0,
    reasoning: s.tokens?.reasoning ?? 0,
    cacheRead: s.tokens?.cache.read ?? 0,
    cacheWrite: s.tokens?.cache.write ?? 0,
  };
}

/** opencode checks all file-mutating tools against the single `edit` permission. */
const EDIT_TOOL_IDS = new Set(["edit", "write", "apply_patch", "multiedit", "patch"]);

function permissionOf(toolId: string): string {
  return EDIT_TOOL_IDS.has(toolId) ? "edit" : toolId;
}

function summarizeInput(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  for (const key of ["command", "filePath", "path", "pattern", "url", "query", "description"]) {
    const v = input[key];
    if (typeof v === "string" && v) return v.length > 120 ? `${v.slice(0, 117)}...` : v;
  }
  return "";
}
