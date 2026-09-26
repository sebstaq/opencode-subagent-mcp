import { describe, expect, it } from "vitest";
import {
  AUTO_MODE_DANGEROUS_BASH_PATTERNS,
  buildRuleset,
  modeBaseline,
  translateClaudeRule,
} from "./permissions.js";

describe("translateClaudeRule", () => {
  it("maps Bash prefix syntax", () => {
    expect(translateClaudeRule("Bash(git push:*)", "deny")).toEqual([
      { permission: "bash", pattern: "git push *", action: "deny" },
    ]);
  });

  it("maps edit-like tools to the edit permission", () => {
    for (const tool of ["Edit", "Write", "MultiEdit", "NotebookEdit"]) {
      expect(translateClaudeRule(`${tool}(./src/**)`, "ask")).toEqual([
        { permission: "edit", pattern: "src/**", action: "ask" },
      ]);
    }
  });

  it("maps WebFetch domains", () => {
    expect(translateClaudeRule("WebFetch(domain:example.com)", "allow")).toEqual([
      { permission: "webfetch", pattern: "*example.com*", action: "allow" },
    ]);
  });

  it("ignores entries without an opencode equivalent", () => {
    expect(translateClaudeRule("mcp__github__create_issue", "allow")).toEqual([]);
  });
});

describe("buildRuleset", () => {
  const claude = { allow: ["Bash(npm test)"], ask: ["Read(./.env)"], deny: ["Bash(rm:*)"] };

  it("orders baseline < allow < ask < deny < isolation", () => {
    const rules = buildRuleset({ mode: "default", claude, isolated: true });
    const tail = rules.slice(modeBaseline("default").length);
    expect(tail.map((r) => r.action)).toEqual(["allow", "ask", "deny", "deny"]);
    expect(tail.at(-1)).toEqual({ permission: "external_directory", pattern: "*", action: "deny" });
  });

  it("bypassPermissions keeps only deny rules on top of allow-all", () => {
    const rules = buildRuleset({ mode: "bypassPermissions", claude, isolated: false });
    expect(rules.map((r) => r.action)).toEqual(["allow", "deny"]);
  });

  it("asks for every dangerous bash pattern in auto mode", () => {
    const rules = modeBaseline("auto");
    for (const pattern of AUTO_MODE_DANGEROUS_BASH_PATTERNS) {
      expect(rules).toContainEqual({ permission: "bash", pattern, action: "ask" });
    }
    expect(AUTO_MODE_DANGEROUS_BASH_PATTERNS.length).toBeGreaterThan(0);
  });

  it("only asks for bash in auto mode, never for paths outside the project", () => {
    const asks = modeBaseline("auto").filter((r) => r.action === "ask");
    expect(asks.every((r) => r.permission === "bash")).toBe(true);
  });

  it("does not add ask rules in bypassPermissions", () => {
    const rules = buildRuleset({
      mode: "bypassPermissions",
      claude: { allow: [], ask: [], deny: [] },
      isolated: false,
    });
    expect(rules.some((r) => r.action === "ask")).toBe(false);
  });

  it("keeps a user Claude allow rule after the auto ask rules", () => {
    const rules = buildRuleset({
      mode: "auto",
      claude: { allow: ["Bash(git push:*)"], ask: [], deny: [] },
      isolated: false,
    });
    const lastAsk = rules.reduce((last, r, i) => (r.action === "ask" ? i : last), -1);
    const allow = rules.findIndex(
      (r) => r.permission === "bash" && r.pattern === "git push *" && r.action === "allow",
    );
    expect(lastAsk).toBeGreaterThanOrEqual(0);
    expect(allow).toBeGreaterThan(lastAsk);
  });

  it("plan mode denies edits and bash", () => {
    const rules = buildRuleset({
      mode: "plan",
      claude: { allow: [], ask: [], deny: [] },
      isolated: false,
    });
    expect(rules).toContainEqual({ permission: "edit", pattern: "*", action: "deny" });
    expect(rules).toContainEqual({ permission: "bash", pattern: "*", action: "deny" });
  });

  it("appends disallowed tools as deny rules", () => {
    const rules = buildRuleset({
      mode: "auto",
      claude: { allow: [], ask: [], deny: [] },
      isolated: false,
      disallowedTools: ["task"],
    });
    expect(rules.at(-1)).toEqual({ permission: "task", pattern: "*", action: "deny" });
  });
});
