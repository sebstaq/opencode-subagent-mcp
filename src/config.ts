import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { PERMISSION_MODES } from "./permissions.js";

const ConfigSchema = z.object({
  /** `provider/model`, used when neither the call nor the agent definition names one. */
  defaultModel: z.string().default("opencode-go/deepseek-v4.1-flash"),
  /** Claude Code does not expose the parent's permission mode to MCP servers, so pick one here. */
  defaultPermissionMode: z.enum(PERMISSION_MODES).default("auto"),
  /** Run `opencode serve --pure` (no external opencode plugins). */
  pure: z.boolean().default(true),
  /** Path to the opencode binary. */
  opencodeBin: z.string().default("opencode"),
  maxConcurrent: z.number().int().positive().default(8),
  /** Result text above this many characters is truncated; the full text is written to a file. */
  maxResultChars: z.number().int().positive().default(80_000),
});

export type Config = z.infer<typeof ConfigSchema>;

export const CONFIG_PATH =
  process.env.OPENCODE_SUBAGENT_CONFIG ??
  join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "opencode-subagent-mcp",
    "config.json",
  );

/** Loads the optional config file; env vars OPENCODE_SUBAGENT_MODEL / _MODE override it. */
export async function loadConfig(path = CONFIG_PATH): Promise<Config> {
  let raw: unknown = {};
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`invalid config ${path}: ${(err as Error).message}`, { cause: err });
    }
  }
  const env = {
    ...(process.env.OPENCODE_SUBAGENT_MODEL && {
      defaultModel: process.env.OPENCODE_SUBAGENT_MODEL,
    }),
    ...(process.env.OPENCODE_SUBAGENT_MODE && {
      defaultPermissionMode: process.env.OPENCODE_SUBAGENT_MODE,
    }),
  };
  return ConfigSchema.parse({ ...(raw as object), ...env });
}

export function parseModel(model: string): { providerID: string; modelID: string } {
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1) {
    throw new Error(`model must be "provider/model", got "${model}"`);
  }
  return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) };
}
