import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { git, tryGit } from "./git.js";

/** Same layout Claude Code uses for its own worktrees. */
const WORKTREE_DIR = join(".claude", "worktrees");

export interface Worktree {
  repoRoot: string;
  path: string;
  branch: string;
  baseRef: string;
  baseCommit: string;
  /** The caller's cwd mapped into the worktree (keeps subdirectory position). */
  cwd: string;
}

export interface WorktreeOutcome {
  kept: boolean;
  path: string;
  branch: string;
  baseRef: string;
  commits: number;
  changedFiles: string[];
}

/** Resolves the branch a new worktree starts from: the repo's default branch, like native subagents. */
export async function resolveBaseRef(repoRoot: string): Promise<string> {
  const originHead = await tryGit(repoRoot, [
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  if (originHead) {
    const local = originHead.replace(/^origin\//, "");
    if (await tryGit(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${local}`])) {
      return local;
    }
    return originHead;
  }
  for (const candidate of ["main", "master"]) {
    if (await tryGit(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${candidate}`])) {
      return candidate;
    }
  }
  return "HEAD";
}

export async function createWorktree(cwd: string, name: string): Promise<Worktree> {
  const repoRoot = await tryGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (!repoRoot) throw new Error(`isolation "worktree" requires a git repository (cwd: ${cwd})`);

  const baseRef = await resolveBaseRef(repoRoot);
  const baseCommit = await git(repoRoot, ["rev-parse", baseRef]);
  const path = join(repoRoot, WORKTREE_DIR, name);
  const branch = `worktree-${name}`;

  await mkdir(join(repoRoot, WORKTREE_DIR), { recursive: true });
  await excludeWorktreeDir(repoRoot);
  await git(repoRoot, ["worktree", "add", "-b", branch, path, baseCommit]);

  return { repoRoot, path, branch, baseRef, baseCommit, cwd: join(path, relative(repoRoot, cwd)) };
}

/** Keeps `.claude/worktrees/` out of `git status` without touching tracked files. */
async function excludeWorktreeDir(repoRoot: string): Promise<void> {
  const ignored = await tryGit(repoRoot, ["check-ignore", "-q", join(WORKTREE_DIR, "x")]);
  if (ignored !== undefined) return;
  const commonDir = await git(repoRoot, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  const excludeFile = join(commonDir, "info", "exclude");
  const line = `/${WORKTREE_DIR}/`;
  const current = await readFile(excludeFile, "utf8").catch(() => "");
  if (current.split("\n").includes(line)) return;
  await mkdir(join(commonDir, "info"), { recursive: true });
  await appendFile(excludeFile, `${current && !current.endsWith("\n") ? "\n" : ""}${line}\n`);
}

/** Removes the worktree when the agent changed nothing; otherwise keeps it for review. */
export async function finalizeWorktree(wt: Worktree): Promise<WorktreeOutcome> {
  const status = await tryGit(wt.path, ["status", "--porcelain"]);
  const commits = Number(
    (await tryGit(wt.path, ["rev-list", "--count", `${wt.baseCommit}..HEAD`])) ?? "0",
  );
  const committedFiles = commits
    ? ((await tryGit(wt.path, ["diff", "--name-only", `${wt.baseCommit}..HEAD`])) ?? "")
    : "";
  const dirtyFiles = (status ?? "")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3));
  const changedFiles = [...new Set([...committedFiles.split("\n").filter(Boolean), ...dirtyFiles])];

  const outcome = {
    path: wt.path,
    branch: wt.branch,
    baseRef: wt.baseRef,
    commits,
    changedFiles,
  };
  if (status === undefined || changedFiles.length > 0 || commits > 0) {
    return { kept: true, ...outcome };
  }
  await git(wt.repoRoot, ["worktree", "remove", "--force", wt.path]);
  await tryGit(wt.repoRoot, ["branch", "-D", wt.branch]);
  return { kept: false, ...outcome };
}
