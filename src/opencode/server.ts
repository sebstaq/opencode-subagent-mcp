import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** opencode default ports and ones commonly held by long-running instances; never bind them. */
const RESERVED_PORTS = new Set([4096, 4097, 44098, 44099]);

export interface OpencodeServer {
  url: string;
  password: string;
  process: ChildProcess;
  close(): void;
}

export interface StartOptions {
  bin: string;
  pure: boolean;
  timeoutMs?: number;
}

async function freePort(): Promise<number> {
  for (;;) {
    const port = await new Promise<number>((resolve, reject) => {
      const srv = createServer();
      srv.once("error", reject);
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address();
        srv.close(() => resolve(typeof addr === "object" && addr ? addr.port : 0));
      });
    });
    if (port && !RESERVED_PORTS.has(port)) return port;
  }
}

const PID_DIR = join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), "opencode-subagent-mcp");

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kills opencode servers left behind by MCP processes that died without cleaning up
 * (e.g. SIGKILL). Each server is recorded as `<mcp pid>.json` while it runs.
 */
export function reapOrphans(): void {
  let files: string[];
  try {
    files = readdirSync(PID_DIR);
  } catch {
    return;
  }
  for (const file of files) {
    const owner = Number(file.replace(/\.json$/, ""));
    if (!owner || alive(owner)) continue;
    const path = join(PID_DIR, file);
    try {
      const { pid } = JSON.parse(readFileSync(path, "utf8")) as { pid: number };
      const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8");
      if (cmdline.includes("serve") && cmdline.includes("opencode")) process.kill(pid, "SIGTERM");
    } catch {
      // Already gone, or not Linux: nothing to reap.
    }
    rmSync(path, { force: true });
  }
}

/** Spawns a private, password-protected `opencode serve` on a random loopback port. */
export async function startOpencodeServer(opts: StartOptions): Promise<OpencodeServer> {
  const port = await freePort();
  const password = randomBytes(24).toString("base64url");
  const args = ["serve", "--hostname", "127.0.0.1", "--port", String(port)];
  if (opts.pure) args.push("--pure");

  const child = spawn(opts.bin, args, {
    env: { ...process.env, OPENCODE_SERVER_PASSWORD: password },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const url = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(`opencode serve did not start within ${opts.timeoutMs ?? 20_000}ms\n${output}`),
      );
    }, opts.timeoutMs ?? 20_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = /opencode server listening on (https?:\/\/\S+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`opencode serve exited with code ${code}\n${output}`));
    });
  });

  // Keep draining output so the child never blocks on a full pipe.
  child.stdout.resume();
  child.stderr.resume();

  const pidFile = join(PID_DIR, `${process.pid}.json`);
  try {
    mkdirSync(PID_DIR, { recursive: true });
    writeFileSync(pidFile, JSON.stringify({ pid: child.pid, url }));
  } catch {
    // Orphan reaping is best effort.
  }
  child.once("exit", () => rmSync(pidFile, { force: true }));

  return {
    url,
    password,
    process: child,
    close() {
      if (child.exitCode === null) child.kill("SIGTERM");
      rmSync(pidFile, { force: true });
    },
  };
}
