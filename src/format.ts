import type { Job, RunResult } from "./runner.js";

export function formatResult(r: RunResult): string {
  const lines: string[] = [];
  if (r.text) lines.push(r.text);
  if (r.structured !== undefined) {
    lines.push("```json", JSON.stringify(r.structured, null, 2), "```");
  }
  const u = r.usage;
  lines.push(
    "",
    "---",
    `agent_id: ${r.agentId} (continue it with send_message)`,
    `status: ${r.status} · ${r.model} · ${r.turns} turns · ${(r.durationMs / 1000).toFixed(1)}s · ` +
      `$${u.cost.toFixed(4)} · tokens in ${u.input + u.cacheRead} / out ${u.output + u.reasoning}`,
  );
  if (r.status === "max_turns") lines.push("note: stopped at maxTurns; output is partial.");
  if (r.error) lines.push(`error: ${r.error}`);
  if (r.worktree) {
    const w = r.worktree;
    lines.push(
      w.kept
        ? `worktree: kept at ${w.path} (branch ${w.branch} from ${w.baseRef}, ${w.commits} commits, ` +
            `${w.changedFiles.length} changed files: ${w.changedFiles.slice(0, 20).join(", ")})`
        : "worktree: removed (no changes)",
    );
  }
  return lines.join("\n");
}

export function formatJob(job: Job): string {
  const age = ((job.finishedAt ?? Date.now()) - job.startedAt) / 1000;
  return `- ${job.id} [${job.status}] "${job.description}" · ${job.model} · ${job.turns} turns · ${age.toFixed(0)}s · ${job.directory}`;
}
