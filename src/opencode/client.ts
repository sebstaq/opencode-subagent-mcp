import type { PermissionRule } from "../permissions.js";

/** opencode's per-session run state; `retry` means it is backing off after a provider error. */
export type SessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | {
      type: "retry";
      attempt?: number;
      message?: string;
      /** Epoch ms of the next attempt. */
      next?: number;
      /** Set for errors that need the user, such as an exhausted subscription limit. */
      action?: { reason?: string };
    };

export interface OpencodeEvent {
  directory?: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}

export interface MessageInfo {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  time?: { created: number; completed?: number };
  cost?: number;
  tokens?: TokenUsage;
  finish?: string;
  modelID?: string;
  providerID?: string;
  structured?: unknown;
  error?: { name: string; data?: { message?: string } };
}

export interface MessagePart {
  id: string;
  type: string;
  text?: string;
  synthetic?: boolean;
  tool?: string;
  state?: { status: string; title?: string; input?: Record<string, unknown> };
  reason?: string;
}

export interface MessageWithParts {
  info: MessageInfo;
  parts: MessagePart[];
}

export interface SessionInfo {
  id: string;
  directory: string;
  title: string;
  parentID?: string;
  cost?: number;
  tokens?: TokenUsage;
}

export interface AgentInfo {
  name: string;
  mode: string;
  description?: string;
}

export interface PromptBody {
  parts: { type: "text"; text: string }[];
  model?: { providerID: string; modelID: string };
  agent?: string;
  system?: string;
  variant?: string;
  tools?: Record<string, boolean>;
  format?: { type: "json_schema"; schema: Record<string, unknown>; retryCount?: number };
}

/** Minimal typed client for the parts of the opencode HTTP API this server uses. */
export class OpencodeClient {
  private readonly auth: string;

  constructor(
    readonly baseUrl: string,
    password: string,
  ) {
    this.auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { directory?: string; query?: Record<string, string>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (opts.directory) url.searchParams.set("directory", opts.directory);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method,
      headers: {
        authorization: this.auth,
        ...(opts.body !== undefined && { "content-type": "application/json" }),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`opencode ${method} ${url.pathname}: ${res.status} ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  health(): Promise<{ healthy: boolean; version: string }> {
    return this.request("GET", "/global/health");
  }

  createSession(
    directory: string,
    body: { title: string; permission: PermissionRule[]; parentID?: string },
  ): Promise<SessionInfo> {
    return this.request("POST", "/session", { directory, body });
  }

  getSession(sessionID: string): Promise<SessionInfo> {
    return this.request("GET", `/session/${sessionID}`);
  }

  promptAsync(directory: string, sessionID: string, body: PromptBody): Promise<void> {
    return this.request("POST", `/session/${sessionID}/prompt_async`, { directory, body });
  }

  abort(directory: string, sessionID: string): Promise<boolean> {
    return this.request("POST", `/session/${sessionID}/abort`, { directory });
  }

  messages(directory: string, sessionID: string, limit?: number): Promise<MessageWithParts[]> {
    return this.request("GET", `/session/${sessionID}/message`, {
      directory,
      ...(limit && { query: { limit: String(limit) } }),
    });
  }

  /**
   * The newest messages, oldest first. opencode 1.18 fails to serialize user messages that
   * carry a json_schema `format`, so when a page includes one we shrink the page until it
   * only holds assistant messages (opencode#26929, #40169).
   */
  async recentMessages(
    directory: string,
    sessionID: string,
    limit = 50,
  ): Promise<MessageWithParts[]> {
    for (let n = limit; ; n = Math.floor(n / 2)) {
      try {
        return await this.messages(directory, sessionID, n);
      } catch (err) {
        if (n <= 1) throw err;
      }
    }
  }

  status(directory: string): Promise<Record<string, SessionStatus>> {
    return this.request("GET", "/session/status", { directory });
  }

  agents(directory: string): Promise<AgentInfo[]> {
    return this.request("GET", "/agent", { directory });
  }

  toolIds(directory: string): Promise<string[]> {
    return this.request("GET", "/experimental/tool/ids", { directory });
  }

  replyPermission(
    directory: string,
    requestID: string,
    reply: "once" | "always" | "reject",
    message?: string,
  ): Promise<boolean> {
    return this.request("POST", `/permission/${requestID}/reply`, {
      directory,
      body: { reply, ...(message && { message }) },
    });
  }

  /**
   * Streams `/global/event` until `signal` aborts, reconnecting on failure.
   * `onConnect` fires after each (re)connect so callers can resync missed state.
   */
  async streamEvents(
    onEvent: (event: OpencodeEvent) => void,
    signal: AbortSignal,
    onConnect?: () => void,
  ): Promise<void> {
    while (!signal.aborted) {
      try {
        const res = await fetch(new URL("/global/event", this.baseUrl), {
          headers: { authorization: this.auth, accept: "text/event-stream" },
          signal,
        });
        if (!res.ok || !res.body) throw new Error(`event stream: ${res.status}`);
        onConnect?.();
        const decoder = new TextDecoder();
        let buffer = "";
        for await (const chunk of res.body) {
          buffer += decoder.decode(chunk as Uint8Array, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const data = frame
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trimStart())
              .join("\n");
            if (!data) continue;
            const parsed = parseEvent(data);
            if (parsed) onEvent(parsed);
          }
        }
      } catch {
        if (signal.aborted) return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

function parseEvent(data: string): OpencodeEvent | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return undefined;
  }
  const obj = raw as {
    directory?: string;
    payload?: { type?: string; properties?: Record<string, unknown> };
    type?: string;
    properties?: Record<string, unknown>;
  };
  const payload = obj.payload ?? obj;
  if (typeof payload.type !== "string") return undefined;
  return { directory: obj.directory, type: payload.type, properties: payload.properties ?? {} };
}
