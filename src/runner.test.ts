import { describe, expect, it } from "vitest";
import type { Config } from "./config.js";
import type { MessageWithParts, OpencodeClient, SessionInfo } from "./opencode/client.js";
import { Runner, type Host } from "./runner.js";

const config: Config = {
  defaultModel: "test/model",
  defaultPermissionMode: "default",
  pure: true,
  opencodeBin: "opencode",
  maxConcurrent: 8,
  maxResultChars: 80_000,
};

const host: Host = { askPermission: async () => ({ reply: "reject" }) };

/** Minimal client standing in for a session opencode still has on disk. */
class FakeClient {
  session: SessionInfo | undefined = {
    id: "ses_1",
    directory: "/tmp/ocsa-adopt",
    title: "adopted",
  };
  messages: MessageWithParts[] = [];

  async getSession(): Promise<SessionInfo> {
    if (!this.session) throw new Error("opencode GET /session/ses_1: 404 not found");
    return this.session;
  }

  async recentMessages(): Promise<MessageWithParts[]> {
    return this.messages;
  }
}

const assistant = (text: string, completed: boolean): MessageWithParts => ({
  info: {
    id: "m1",
    sessionID: "ses_1",
    role: "assistant",
    time: { created: 1, ...(completed && { completed: 2 }) },
  },
  parts: [{ id: "p1", type: "text", text }],
});

const user = (): MessageWithParts => ({
  info: { id: "m0", sessionID: "ses_1", role: "user", time: { created: 1 } },
  parts: [{ id: "p0", type: "text", text: "hi" }],
});

const adopt = (client: FakeClient, id = "ses_1") =>
  new Runner(config, async () => client as unknown as OpencodeClient, host).adopt(id);

describe("Runner.adopt", () => {
  it("adopts a session whose last assistant message completed", async () => {
    const client = new FakeClient();
    client.messages = [user(), assistant("all done", true)];
    const job = await adopt(client);
    expect(job.status).toBe("completed");
    expect(job.result?.status).toBe("completed");
    expect(job.result?.text).toBe("all done");
    expect(job.result?.error).toBeUndefined();
  });

  it("adopts an unfinished assistant message as stopped", async () => {
    const client = new FakeClient();
    client.messages = [user(), assistant("partial", false)];
    const job = await adopt(client);
    expect(job.status).toBe("stopped");
    expect(job.result?.status).toBe("stopped");
    expect(job.result?.text).toBe("partial");
    expect(job.result?.error).toMatch(/^interrupted:/);
  });

  it("adopts a user message with no reply as stopped", async () => {
    const client = new FakeClient();
    client.messages = [user()];
    const job = await adopt(client);
    expect(job.status).toBe("stopped");
    expect(job.result?.error).toMatch(/^interrupted:/);
  });

  it("throws unknown agent when opencode has no such session", async () => {
    const client = new FakeClient();
    client.session = undefined;
    await expect(adopt(client, "nope")).rejects.toThrow("unknown agent nope");
  });

  it("returns the existing job without reloading it", async () => {
    const client = new FakeClient();
    const runner = new Runner(config, async () => client as unknown as OpencodeClient, host);
    client.messages = [user(), assistant("all done", true)];
    const first = await runner.adopt("ses_1");
    client.session = undefined;
    expect(await runner.adopt("ses_1")).toBe(first);
  });
});
