/**
 * End-to-end smoke test: starts the MCP server over stdio, runs a real agent in a temporary
 * git repo (worktree isolation, default permission mode) and auto-approves permission prompts.
 * Usage: pnpm smoke [provider/model]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const repo = mkdtempSync(join(tmpdir(), "ocsa-smoke-"));
const sh = (...args: string[]) => execFileSync("git", args, { cwd: repo });
sh("init", "-q", "-b", "main");
writeFileSync(join(repo, "README.md"), "# smoke\n");
sh("add", ".");
sh("-c", "user.name=smoke", "-c", "user.email=smoke@example.com", "commit", "-qm", "init");

const client = new Client(
  { name: "smoke", version: "0" },
  { capabilities: { elicitation: {}, roots: { listChanged: false } } },
);
client.setRequestHandler(ElicitRequestSchema, async (req) => {
  console.log("[elicitation]", req.params.message.split("\n").slice(0, 2).join(" | "));
  return { action: "accept", content: { decision: "once" } };
});
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [join(import.meta.dirname, "..", "dist", "index.js")],
    cwd: join(import.meta.dirname, ".."),
    env: { ...(process.env as Record<string, string>), CLAUDE_PROJECT_DIR: repo },
    stderr: "inherit",
  }),
);

const list = await client.callTool({ name: "list", arguments: {} });
console.log((list.content as { text: string }[])[0]!.text);

const result = await client.callTool(
  {
    name: "agent",
    arguments: {
      description: "Write hello file",
      prompt:
        "Create a file hello.txt containing exactly 'hi', then run `git add hello.txt && git commit -m hello` " +
        "and answer with the word DONE.",
      isolation: "worktree",
      permission_mode: "default",
      ...(process.argv[2] && { model: process.argv[2] }),
    },
  },
  undefined,
  {
    timeout: 600_000,
    onprogress: (p) => console.log("[progress]", p.message),
  },
);
const out = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;
const call = (name: string, args: Record<string, unknown>) =>
  client.callTool({ name, arguments: args }, undefined, { timeout: 600_000 });
console.log(out(result));
console.log("repo:", repo);
console.log(execFileSync("git", ["branch", "-a"], { cwd: repo }).toString());

const agentId = /agent_id: (\S+)/.exec(out(result))![1]!;
console.log("\n== send_message ==");
console.log(
  out(
    await call("send_message", {
      agent_id: agentId,
      message: "Which file did you create? Reply with the filename only.",
    }),
  ),
);

console.log("\n== output_schema ==");
const structured = await call("agent", {
  description: "Add numbers",
  prompt: "What is 2+3?",
  permission_mode: "auto",
  output_schema: {
    type: "object",
    properties: { answer: { type: "number" } },
    required: ["answer"],
  },
});
console.log(out(structured), "\nstructuredContent:", JSON.stringify(structured.structuredContent));

console.log("\n== max_turns ==");
console.log(
  out(
    await call("agent", {
      description: "Many steps",
      prompt:
        "Run `echo 1`, then `echo 2`, then `echo 3`, then `echo 4` as four separate bash calls, one at a time, then summarize.",
      permission_mode: "auto",
      max_turns: 2,
    }),
  ),
);

console.log("\n== background + stop ==");
const bg = out(
  await call("agent", {
    description: "Slow task",
    prompt: "Run `sleep 60` with bash, then say finished.",
    permission_mode: "auto",
    run_in_background: true,
  }),
);
console.log(bg);
const bgId = /agent (ses_\S+)/.exec(bg)![1]!;
console.log(out(await call("wait", { agent_id: bgId, timeout_seconds: 5 })));
console.log(out(await call("stop", { agent_id: bgId })));
console.log(out(await call("list", {})).split("\n\n")[0]);
await client.close();
