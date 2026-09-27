---
name: delegate-to-opencode
description: Decide when to delegate work to the opencode subagent tools (agent, send_message, wait, stop, list) instead of a native Claude subagent, and how to brief and review them. Use before delegating implementation, refactors, bug fixes, tests, research or build/test runs.
---

# Delegating to opencode subagents

The opencode MCP server's `agent` tool runs a subagent on an opencode model (by default
`opencode-go/deepseek-v4.1-flash`). It costs a fraction of a native Claude subagent and is
capable, so use it for most delegated work rather than reserving it for trivial tasks.

## When to use it

Good fits: implementing features from a clear goal, refactors, bug fixes, writing tests,
codebase and docs research, investigations, running and fixing builds or tests, and drafting
docs.

The test: can you verify the result clearly cheaper than doing the work with a native subagent
(read the diff, run the tests, spot-check cited sources)? If yes, use opencode.

Use a native Claude subagent instead when verifying would cost about as much as doing the work
(open-ended architecture decisions, subtle debugging where the reasoning is the deliverable,
reviews you would have to redo to trust), or when the task needs this conversation's context.

## How to delegate

- Write a self-contained prompt: the agent sees none of this conversation. State the goal,
  constraints, relevant paths and how to verify the result.
- Pass `isolation: "worktree"` for code changes. The agent works on its own branch; review the
  diff and merge the kept branch yourself.
- Use `run_in_background: true` for independent tasks and collect them with `wait`. Continue a
  finished agent with `send_message` instead of starting over.
- An `agent_id` survives a restart of the MCP server or Claude Code session: `wait` and `stop`
  still report what happened to it, and `send_message` continues it. An agent that was running
  through a restart comes back as `stopped` with an interruption error; send it "continue".
- Review in proportion to risk: spot-check claims and run the tests, don't redo the work.
