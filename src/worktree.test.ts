import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createWorktree, finalizeWorktree } from "./worktree.js";

let repo: string;
const git = (...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd: repo,
  }).toString();

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "ocsa-wt-"));
  git("init", "-q", "-b", "main");
  mkdirSync(join(repo, "pkg"));
  writeFileSync(join(repo, "pkg", "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-qm", "init");
  git("checkout", "-qb", "feature");
});

describe("worktrees", () => {
  it("branches from the default branch and maps the cwd", async () => {
    const wt = await createWorktree(join(repo, "pkg"), "t1");
    expect(wt.baseRef).toBe("main");
    expect(wt.cwd).toBe(join(wt.path, "pkg"));
    expect(readFileSync(join(repo, ".git", "info", "exclude"), "utf8")).toContain(
      "/.claude/worktrees/",
    );
    expect(git("status", "--porcelain")).toBe("");
  });

  it("removes an unchanged worktree and its branch", async () => {
    const wt = await createWorktree(repo, "t2");
    const outcome = await finalizeWorktree(wt);
    expect(outcome.kept).toBe(false);
    expect(existsSync(wt.path)).toBe(false);
    expect(git("branch", "--list", wt.branch)).toBe("");
  });

  it("keeps a worktree with commits or dirty files", async () => {
    const wt = await createWorktree(repo, "t3");
    writeFileSync(join(wt.path, "new.txt"), "x\n");
    const outcome = await finalizeWorktree(wt);
    expect(outcome).toMatchObject({ kept: true, commits: 0, changedFiles: ["new.txt"] });
    expect(existsSync(wt.path)).toBe(true);
  });
});
