import { describe, expect, it } from "vitest";
import type { Config } from "./config.js";
import type { MessageWithParts, OpencodeClient, SessionInfo } from "./opencode/client.js";
import { Job, Runner, type Host } from "./runner.js";

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

/** A running job as `start` leaves it, registered on a runner backed by `client`. */
const running = (client: FakeClient) => {
  const runner = new Runner(config, async () => client as unknown as OpencodeClient, host);
  const job = new Job(
    "ses_1",
    "probe",
    "/tmp/ocsa",
    "opencode-go/x",
    "default",
    {
      model: { providerID: "opencode-go", modelID: "x" },
      agent: "general",
    },
    [],
  );
  const maps = runner as unknown as { jobs: Map<string, Job>; owners: Map<string, Job> };
  maps.jobs.set(job.id, job);
  maps.owners.set(job.id, job);
  return { runner, job };
};

describe("Runner errors before the first reply", () => {
  it("fails the run when opencode reports session.error and idles without a reply", async () => {
    const client = Object.assign(new FakeClient(), { status: async () => ({}) });
    client.messages = [user()];
    const { runner, job } = running(client);
    runner.handleEvent({
      type: "session.error",
      properties: {
        sessionID: "ses_1",
        error: {
          name: "UnknownError",
          data: { message: "Model not found: opencode-go/x. Did you mean: x?\n    at stack" },
        },
      },
    });
    runner.handleEvent({ type: "session.idle", properties: { sessionID: "ses_1" } });
    const result = await job.done;
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/^Model not found: opencode-go\/x\. Did you mean: x\? Check/);
    expect(result.error).toContain("opencode auth login");
    expect(result.error).not.toContain("at stack");
  });
});
