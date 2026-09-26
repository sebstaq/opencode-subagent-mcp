import { describe, expect, it } from "vitest";
import { parseFrontmatter, toDefinition, toOpencodeTools } from "./agents.js";

describe("parseFrontmatter", () => {
  it("parses scalars, inline lists and block lists", () => {
    const { data, body } = parseFrontmatter(
      "---\nname: reviewer\ntools: [Read, Grep]\ndisallowedTools:\n  - Bash\n  - Write\nmaxTurns: 5\n---\nBody text\n",
    );
    expect(data).toEqual({
      name: "reviewer",
      tools: ["Read", "Grep"],
      disallowedTools: ["Bash", "Write"],
      maxTurns: "5",
    });
    expect(body).toBe("Body text");
  });
});

const withModel = (model: string) => `---\nname: a\nmodel: ${model}\n---\nhi`;

describe("toDefinition", () => {
  it("keeps opencode models and drops Claude aliases", () => {
    expect(toDefinition(withModel("sonnet"), "x", "a").model).toBeUndefined();
    expect(toDefinition(withModel("opencode-go/kimi-k2"), "x", "a").model).toBe(
      "opencode-go/kimi-k2",
    );
  });

  it("reads comma-separated tools and validates permissionMode", () => {
    const def = toDefinition(
      "---\ntools: Read, Grep, Bash(git *)\npermissionMode: nonsense\nisolation: worktree\n---\n",
      "x",
      "fallback",
    );
    expect(def.name).toBe("fallback");
    expect(def.tools).toEqual(["Read", "Grep", "Bash(git *)"]);
    expect(def.permissionMode).toBeUndefined();
    expect(def.isolation).toBe("worktree");
  });
});

describe("toOpencodeTools", () => {
  it("maps Claude names and passes opencode ids through", () => {
    expect(toOpencodeTools(["Edit", "Bash(git *)", "lsp"])).toEqual([
      "edit",
      "apply_patch",
      "bash",
      "lsp",
    ]);
  });
});
