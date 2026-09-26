import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** opencode permission rule; later rules take precedence over earlier ones. */
export interface PermissionRule {
  permission: string;
  pattern: string;
  action: "allow" | "ask" | "deny";
}

/** Mirrors Claude Code's permission modes. */
export type PermissionMode = "default" | "acceptEdits" | "auto" | "bypassPermissions" | "plan";

export const PERMISSION_MODES: readonly PermissionMode[] = [
  "default",
  "acceptEdits",
  "auto",
  "bypassPermissions",
  "plan",
];

export interface ClaudePermissionLists {
  allow: string[];
  ask: string[];
  deny: string[];
}

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/**
 * Translates one Claude Code permission entry (e.g. `Bash(git push:*)`, `Read(./.env)`)
 * into opencode rules. Entries without an opencode equivalent (MCP tools etc.) yield [].
 */
export function translateClaudeRule(
  entry: string,
  action: PermissionRule["action"],
): PermissionRule[] {
  const match = /^([A-Za-z]+)(?:\((.*)\))?$/.exec(entry.trim());
  if (!match) return [];
  const tool = match[1]!;
  const spec = match[2];

  if (tool === "Bash") {
    return [{ permission: "bash", pattern: bashPattern(spec), action }];
  }
  if (EDIT_TOOLS.has(tool)) {
    return [{ permission: "edit", pattern: pathPattern(spec), action }];
  }
  if (tool === "Read") {
    return [{ permission: "read", pattern: pathPattern(spec), action }];
  }
  if (tool === "WebFetch") {
    const domain = spec?.startsWith("domain:") ? spec.slice("domain:".length) : undefined;
    return [{ permission: "webfetch", pattern: domain ? `*${domain}*` : "*", action }];
  }
  if (tool === "WebSearch") {
    return [{ permission: "websearch", pattern: "*", action }];
  }
  return [];
}

function bashPattern(spec: string | undefined): string {
  if (!spec || spec === "*") return "*";
  // Claude's legacy prefix syntax `cmd:*` means "cmd followed by anything".
  if (spec.endsWith(":*")) return `${spec.slice(0, -2)} *`;
  return spec;
}

function pathPattern(spec: string | undefined): string {
  if (!spec || spec === "*" || spec === "**") return "*";
  if (spec.startsWith("//")) return spec.slice(1);
  if (spec.startsWith("~/")) return join(homedir(), spec.slice(2));
  if (spec.startsWith("./")) return spec.slice(2);
  return spec;
}

/** Baseline rules for a mode, before the user's Claude allow/ask/deny lists are applied. */
export function modeBaseline(mode: PermissionMode): PermissionRule[] {
  const all = (action: PermissionRule["action"]): PermissionRule => ({
    permission: "*",
    pattern: "*",
    action,
  });
  switch (mode) {
    case "bypassPermissions":
      return [all("allow")];
    case "auto":
      // No classifier exists on the opencode side; auto approximates to "allow unless a
      // Claude ask/deny rule says otherwise", with writes outside the project still asking.
      return [all("allow"), { permission: "external_directory", pattern: "*", action: "ask" }];
    case "acceptEdits":
      return [
        all("allow"),
        { permission: "bash", pattern: "*", action: "ask" },
        { permission: "external_directory", pattern: "*", action: "ask" },
      ];
    case "default":
      return [
        all("allow"),
        { permission: "edit", pattern: "*", action: "ask" },
        { permission: "bash", pattern: "*", action: "ask" },
        { permission: "external_directory", pattern: "*", action: "ask" },
      ];
    case "plan":
      return [
        all("allow"),
        { permission: "edit", pattern: "*", action: "deny" },
        { permission: "bash", pattern: "*", action: "deny" },
        { permission: "external_directory", pattern: "*", action: "deny" },
      ];
  }
}

export interface BuildRulesetOptions {
  mode: PermissionMode;
  claude: ClaudePermissionLists;
  /** Worktree isolation: anything outside the worktree is denied outright. */
  isolated: boolean;
  /** Tool names to disable entirely (Claude's `disallowedTools`, mapped to opencode names). */
  disallowedTools?: string[];
}

/**
 * Builds the session ruleset. Order encodes Claude's precedence (deny > ask > allow):
 * baseline, then allow, then ask, then deny, then isolation.
 */
export function buildRuleset(opts: BuildRulesetOptions): PermissionRule[] {
  const rules = [...modeBaseline(opts.mode)];
  if (opts.mode !== "bypassPermissions" && opts.mode !== "plan") {
    rules.push(...opts.claude.allow.flatMap((e) => translateClaudeRule(e, "allow")));
  }
  if (opts.mode !== "bypassPermissions") {
    rules.push(...opts.claude.ask.flatMap((e) => translateClaudeRule(e, "ask")));
  }
  rules.push(...opts.claude.deny.flatMap((e) => translateClaudeRule(e, "deny")));
  for (const tool of opts.disallowedTools ?? []) {
    rules.push({ permission: tool, pattern: "*", action: "deny" });
  }
  if (opts.isolated) {
    rules.push({ permission: "external_directory", pattern: "*", action: "deny" });
  }
  return rules;
}

/** Reads and merges permission lists from user, project and local Claude settings. */
export async function loadClaudePermissions(projectDir: string): Promise<ClaudePermissionLists> {
  const files = [
    join(homedir(), ".claude", "settings.json"),
    join(projectDir, ".claude", "settings.json"),
    join(projectDir, ".claude", "settings.local.json"),
  ];
  const merged: ClaudePermissionLists = { allow: [], ask: [], deny: [] };
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(file, "utf8"));
    } catch {
      continue;
    }
    const perms = (
      parsed as { permissions?: Partial<Record<keyof ClaudePermissionLists, unknown>> }
    ).permissions;
    if (!perms) continue;
    for (const key of ["allow", "ask", "deny"] as const) {
      const list = perms[key];
      if (Array.isArray(list)) merged[key].push(...list.filter((v) => typeof v === "string"));
    }
  }
  return merged;
}
