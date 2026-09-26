import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { PERMISSION_MODES, type PermissionMode } from "./permissions.js";

/** A Claude Code subagent definition (`.claude/agents/*.md`) reused for opencode runs. */
export interface AgentDefinition {
  name: string;
  description?: string;
  prompt: string;
  source: string;
  tools?: string[];
  disallowedTools?: string[];
  /** Only set when the definition names an opencode `provider/model`; Claude aliases are ignored. */
  model?: string;
  permissionMode?: PermissionMode;
  maxTurns?: number;
  effort?: string;
  isolation?: "worktree";
}

/** Claude Code tool names mapped to opencode tool ids. */
const TOOL_MAP: Record<string, string[]> = {
  Bash: ["bash"],
  Read: ["read"],
  Edit: ["edit", "apply_patch"],
  MultiEdit: ["edit", "apply_patch"],
  Write: ["write"],
  NotebookEdit: ["edit"],
  Glob: ["glob"],
  Grep: ["grep"],
  LS: ["list"],
  WebFetch: ["webfetch"],
  WebSearch: ["websearch", "codesearch"],
  TodoWrite: ["todowrite", "todoread"],
  Agent: ["task"],
  Task: ["task"],
  Skill: ["skill"],
};

/** Accepts Claude tool names (`Bash`, `Bash(git *)`) or opencode ids (`bash`); returns opencode ids. */
export function toOpencodeTools(names: string[]): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    const name = raw.replace(/\(.*\)$/, "").trim();
    if (!name) continue;
    for (const id of TOOL_MAP[name] ?? [name]) out.add(id);
  }
  return [...out];
}

/** Parses the small YAML subset Claude agent frontmatter uses: scalars, inline and block lists. */
export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  const data: Record<string, unknown> = {};
  let listKey: string | undefined;
  for (const line of match[1]!.split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (data[listKey] as string[]).push(unquote(item[1]!));
      continue;
    }
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, value] = kv as unknown as [string, string, string];
    if (value === "") {
      data[key] = [];
      listKey = key;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value.slice(1, -1).split(",").map(unquote).filter(Boolean);
      listKey = undefined;
    } else {
      data[key] = unquote(value);
      listKey = undefined;
    }
  }
  return { data, body: match[2]!.trim() };
}

function unquote(v: string): string {
  const t = v.trim();
  return /^(["']).*\1$/.test(t) ? t.slice(1, -1) : t;
}

function asList(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v)
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return undefined;
}

export function toDefinition(text: string, source: string, fallbackName: string): AgentDefinition {
  const { data, body } = parseFrontmatter(text);
  const str = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : undefined);
  const model = str("model");
  const mode = str("permissionMode");
  const maxTurns = Number(str("maxTurns"));
  return {
    name: str("name") ?? fallbackName,
    description: str("description"),
    prompt: body,
    source,
    tools: asList(data.tools),
    disallowedTools: asList(data.disallowedTools),
    model: model?.includes("/") ? model : undefined,
    permissionMode: PERMISSION_MODES.includes(mode as PermissionMode)
      ? (mode as PermissionMode)
      : undefined,
    maxTurns: Number.isInteger(maxTurns) && maxTurns > 0 ? maxTurns : undefined,
    effort: str("effort"),
    isolation: str("isolation") === "worktree" ? "worktree" : undefined,
  };
}

/** Loads agent definitions; project definitions shadow user ones with the same name. */
export async function loadAgentDefinitions(
  projectDir: string,
): Promise<Map<string, AgentDefinition>> {
  const dirs = [join(homedir(), ".claude", "agents"), join(projectDir, ".claude", "agents")];
  const defs = new Map<string, AgentDefinition>();
  for (const dir of dirs) {
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files.filter((f) => f.endsWith(".md")).toSorted()) {
      const path = join(dir, file);
      try {
        const def = toDefinition(await readFile(path, "utf8"), path, file.slice(0, -3));
        defs.set(def.name, def);
      } catch {
        // An unreadable definition should not break the other agents.
      }
    }
  }
  return defs;
}
