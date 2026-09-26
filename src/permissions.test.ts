import { describe, expect, it } from "vitest";
import { buildRuleset, modeBaseline, translateClaudeRule } from "./permissions.js";

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
