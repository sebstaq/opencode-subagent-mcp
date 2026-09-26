import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadAgentDefinitions } from "./agents.js";
import type { Config } from "./config.js";
import { formatAge, formatJob, formatResult } from "./format.js";
import { OpencodeClient } from "./opencode/client.js";
import { startOpencodeServer, type OpencodeServer } from "./opencode/server.js";
import { PERMISSION_MODES } from "./permissions.js";
import {
  Runner,
  type Host,
  type Job,
  type PermissionReply,
  type PermissionRequest,
} from "./runner.js";

type Extra = {
  signal: AbortSignal;
  _meta?: { progressToken?: string | number };
  sendNotification: (n: {
    method: "notifications/progress";
    params: { progressToken: string | number; progress: number; message?: string };
  }) => Promise<void>;
};

/** Well under the MCP clients' idle timeouts (Claude Code: 30 minutes). */
const HEARTBEAT_MS = 60_000;

const text = (t: string, isError = false): CallToolResult => ({
  content: [{ type: "text", text: t }],
  ...(isError && { isError }),
});

const guard =
  <A>(fn: (args: A, extra: Extra) => Promise<CallToolResult>) =>
  async (args: A, extra: unknown): Promise<CallToolResult> => {
    try {
      return await fn(args, extra as Extra);
    } catch (err) {
      return text(`Error: ${(err as Error).message}`, true);
    }
  };

export function createServer(config: Config): { mcp: McpServer; shutdown: () => void } {
  const mcp = new McpServer(
    { name: "opencode-subagent-mcp", version: "0.1.0" },
    {
      instructions:
        "Runs subagents on opencode models (default: " +
        config.defaultModel +
        "). Use it like the built-in Agent tool when a cheaper or different model fits the task. " +
        "Calls block until the agent finishes; long calls move to the background automatically and " +
        "notify on completion. Continue a finished agent with send_message.",
    },
  );

  // ---- opencode lifecycle -------------------------------------------------------------
  let serverPromise: Promise<{ server: OpencodeServer; client: OpencodeClient }> | undefined;
  /** Held synchronously so shutdown can kill the child from a signal handler. */
  let liveServer: OpencodeServer | undefined;
  const events = new AbortController();

  const client = async (): Promise<OpencodeClient> => {
    if (serverPromise) {
      const current = await serverPromise.catch(() => undefined);
      if (current && current.server.process.exitCode === null) return current.client;
      serverPromise = undefined;
    }
    serverPromise = (async () => {
      const server = await startOpencodeServer({ bin: config.opencodeBin, pure: config.pure });
      liveServer = server;
      const oc = new OpencodeClient(server.url, server.password);
      void oc.streamEvents(
        (e) => runner.handleEvent(e),
        events.signal,
        () => void runner.resync(),
      );
      return { server, client: oc };
    })();
    return (await serverPromise).client;
  };

  // ---- permission prompts via MCP elicitation ------------------------------------------
  let promptChain: Promise<unknown> = Promise.resolve();
  const host: Host = {
    askPermission(job: Job, req: PermissionRequest): Promise<PermissionReply> {
      const ask = async (): Promise<PermissionReply> => {
        if (!mcp.server.getClientCapabilities()?.elicitation) {
          return {
            reply: "reject",
            message: "The MCP client cannot show permission prompts; this action was denied.",
          };
        }
        const res = await mcp.server.elicitInput({
          message: describePermission(job, req),
          requestedSchema: {
            type: "object",
            properties: {
              decision: {
                type: "string",
                title: "Decision",
                enum: ["once", "always", "reject"],
                enumNames: ["Allow once", "Allow for the rest of this agent's session", "Deny"],
                default: "once",
              },
              feedback: {
                type: "string",
                title: "Message to the agent (optional)",
              },
            },
            required: ["decision"],
          },
        });
        const content = res.content as { decision?: string; feedback?: string } | undefined;
        if (res.action !== "accept" || !content?.decision) {
          return { reply: "reject", message: content?.feedback || "The user denied this action." };
        }
        const decision = content.decision as PermissionReply["reply"];
        return { reply: decision, message: content.feedback || undefined };
      };
      const next = promptChain.then(ask, ask);
      promptChain = next.catch(() => undefined);
      return next;
    },
  };

  const runner = new Runner(config, client, host);

  const resolveCwd = async (cwd?: string): Promise<string> => {
    let base = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    if (mcp.server.getClientCapabilities()?.roots) {
      try {
        const { roots } = await mcp.server.listRoots(undefined, { timeout: 5_000 });
        const root = roots.find((r) => r.uri.startsWith("file://"));
        if (root) base = fileURLToPath(root.uri);
      } catch {
        // Fall back to the environment.
      }
    }
    return cwd ? resolve(base, cwd) : base;
  };

  /**
   * Waits for a job, streaming its tool activity as MCP progress notifications. A heartbeat
   * keeps quiet stretches (long model turns) from tripping the client's idle timeout.
   * Cancelling the call stops the agent only when the call started it; cancelling a `wait`
   * leaves the background agent running.
   */
  const waitFor = async (
    job: Job,
    extra: Extra,
    opts: { timeoutMs?: number; stopOnCancel: boolean },
  ): Promise<CallToolResult> => {
    const token = extra._meta?.progressToken;
    let progress = 0;
    const notify = (message: string) => {
      if (token === undefined) return;
      void extra
        .sendNotification({
          method: "notifications/progress",
          params: { progressToken: token, progress: ++progress, message },
        })
        .catch(() => undefined);
    };
    job.onProgress = notify;
    const heartbeat = setInterval(
      () => notify(`still running · ${job.turns} turns · ${formatAge(job)}`),
      HEARTBEAT_MS,
    );
    heartbeat.unref();
    const onCancel = () => {
      if (opts.stopOnCancel) void runner.stop(job.id).catch(() => undefined);
    };
    extra.signal.addEventListener("abort", onCancel, { once: true });
    try {
      const { timeoutMs } = opts;
      const result = await (timeoutMs
        ? Promise.race([
            job.done,
            new Promise<undefined>((r) => setTimeout(r, timeoutMs, undefined)),
          ])
        : job.done);
      if (!result) return text(`Agent ${job.id} is still running.\n${formatJob(job)}`);
      return {
        ...text(formatResult(result), result.status === "failed"),
        ...(result.structured !== undefined &&
          typeof result.structured === "object" && {
            structuredContent: result.structured as Record<string, unknown>,
          }),
      };
    } finally {
      clearInterval(heartbeat);
      extra.signal.removeEventListener("abort", onCancel);
      job.onProgress = undefined;
    }
  };

  // ---- tools ----------------------------------------------------------------------------
  mcp.registerTool(
    "agent",
    {
      title: "opencode subagent",
      description:
        "Launch a subagent that runs on an opencode model (default " +
        config.defaultModel +
        ") in the current project. Mirrors the built-in Agent tool: give a self-contained task " +
        "prompt; the agent starts with no conversation context and returns only its final report. " +
        "subagent_type accepts Claude agent definitions from .claude/agents/ (their prompt, tools, " +
        "permissionMode and maxTurns apply) or opencode agents (general, explore, plan, build). " +
        "isolation 'worktree' runs it in a temporary git worktree off the default branch, removed " +
        "if unchanged. The call blocks until the agent finishes (it is backgrounded automatically " +
        "after a while); set run_in_background to return at once and collect the result with wait.",
      inputSchema: {
        description: z.string().describe("Short (3-5 word) description of the task"),
        prompt: z.string().describe("The task for the agent to perform"),
        subagent_type: z
          .string()
          .optional()
          .describe("Claude agent definition name or opencode agent name (default: general)"),
        model: z
          .string()
          .optional()
          .describe(`opencode model as provider/model (default: ${config.defaultModel})`),
        isolation: z.enum(["worktree"]).optional(),
        permission_mode: z
          .enum(PERMISSION_MODES)
          .optional()
          .describe(`Permission mode (default: ${config.defaultPermissionMode})`),
        tools: z
          .array(z.string())
          .optional()
          .describe("Allowlist of tools (Claude or opencode names)"),
        disallowed_tools: z.array(z.string()).optional(),
        max_turns: z.number().int().positive().optional(),
        effort: z
          .string()
          .optional()
          .describe("Model variant/reasoning effort, e.g. low, high, max"),
        output_schema: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("JSON Schema the final answer must satisfy; returned as structured output"),
        run_in_background: z.boolean().optional(),
        cwd: z.string().optional().describe("Working directory (default: the project directory)"),
      },
    },
    guard(async (args, extra) => {
      const cwd = await resolveCwd(args.cwd);
      const defs = await loadAgentDefinitions(cwd);
      const definition = args.subagent_type ? defs.get(args.subagent_type) : undefined;
      const job = await runner.start({
        description: args.description,
        prompt: args.prompt,
        cwd,
        definition,
        opencodeAgent: definition ? undefined : args.subagent_type,
        model: args.model,
        permissionMode: args.permission_mode,
        isolation: args.isolation,
        tools: args.tools,
        disallowedTools: args.disallowed_tools,
        maxTurns: args.max_turns,
        effort: args.effort,
        schema: args.output_schema,
      });
      if (args.run_in_background) {
        return text(
          `Started agent ${job.id} in the background ("${job.description}", ${job.model}). ` +
            "Use wait to collect the result.",
        );
      }
      return waitFor(job, extra, { stopOnCancel: true });
    }),
  );

  mcp.registerTool(
    "send_message",
    {
      title: "Continue an opencode subagent",
      description:
        "Send a follow-up message to a finished opencode subagent by agent_id. It resumes with its " +
        "full previous history (and its worktree, if one was kept) and returns its new final report.",
      inputSchema: {
        agent_id: z.string(),
        message: z.string(),
        max_turns: z.number().int().positive().optional(),
        run_in_background: z.boolean().optional(),
      },
    },
    guard(async (args, extra) => {
      const job = await runner.resume(args.agent_id, args.message, args.max_turns);
      if (args.run_in_background) return text(`Resumed agent ${job.id} in the background.`);
      return waitFor(job, extra, { stopOnCancel: true });
    }),
  );

  mcp.registerTool(
    "wait",
    {
      title: "Wait for an opencode subagent",
      description: "Wait for a background opencode subagent and return its result.",
      inputSchema: {
        agent_id: z.string(),
        timeout_seconds: z.number().positive().optional().describe("Return early if still running"),
      },
    },
    guard(async (args, extra) => {
      const job = runner.get(args.agent_id);
      if (!job) return text(`Unknown agent ${args.agent_id}`, true);
      return waitFor(job, extra, {
        timeoutMs: args.timeout_seconds && args.timeout_seconds * 1000,
        stopOnCancel: false,
      });
    }),
  );

  mcp.registerTool(
    "stop",
    {
      title: "Stop an opencode subagent",
      description: "Abort a running opencode subagent. Returns what it produced so far.",
      inputSchema: { agent_id: z.string() },
    },
    guard(async (args) => {
      const job = await runner.stop(args.agent_id);
      const result = await job.done;
      return text(formatResult(result));
    }),
  );

  mcp.registerTool(
    "list",
    {
      title: "List opencode subagents",
      description: "List this session's opencode subagents and the available agent types.",
      inputSchema: { cwd: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    guard(async (args) => {
      const cwd = await resolveCwd(args.cwd);
      const defs = [...(await loadAgentDefinitions(cwd)).values()];
      const oc = await client();
      const agents = (await oc.agents(cwd)).filter(
        (a) => a.mode !== "primary" || ["build", "plan"].includes(a.name),
      );
      const jobs = runner.list();
      return text(
        [
          "Agents:",
          ...(jobs.length ? jobs.map(formatJob) : ["(none)"]),
          "",
          "Claude agent definitions (subagent_type):",
          ...(defs.length
            ? defs.map((d) => `- ${d.name}${d.description ? `: ${d.description}` : ""}`)
            : ["(none)"]),
          "",
          "opencode agents (subagent_type):",
          ...agents.map(
            (a) => `- ${a.name}${a.description ? `: ${a.description.split("\n")[0]}` : ""}`,
          ),
          "",
          `Default model: ${config.defaultModel} · default permission mode: ${config.defaultPermissionMode}`,
        ].join("\n"),
      );
    }),
  );

  const shutdown = () => {
    events.abort();
    liveServer?.close();
  };
  return { mcp, shutdown };
}

function describePermission(job: Job, req: PermissionRequest): string {
  const meta = req.metadata;
  const detail =
    (typeof meta.command === "string" && `$ ${meta.command}`) ||
    (typeof meta.filepath === "string" && meta.filepath) ||
    (typeof meta.filePath === "string" && meta.filePath) ||
    req.patterns.join(", ");
  const diff = typeof meta.diff === "string" ? `\n\n${meta.diff.slice(0, 3000)}` : "";
  return `opencode agent "${job.description}" (${job.model}) wants to use ${req.permission}:\n${detail}${diff}`;
}
