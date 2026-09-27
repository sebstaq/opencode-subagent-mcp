# Changelog

## [0.1.3] - 2026-09-27

- Agent ids from before an MCP server or Claude Code restart now work with `wait`, `stop` and `send_message`: the session is adopted from opencode's local store, reported as completed or stopped (interrupted) from its messages, and can be continued.

## [0.1.2] - 2026-09-26

- Fail fast with the provider's message when opencode hits a usage limit or a long retry backoff, instead of hanging at 0 turns.
- Send a progress heartbeat every minute while waiting, so long runs are not cut off by the MCP client's idle timeout.
- Cancelling a `wait` call no longer stops the background agent.

## [0.1.1] - 2026-09-26

- Publish to the official MCP registry as `io.github.sebstaq/opencode-subagent-mcp`.
- Release from GitHub Actions with npm provenance.

## [0.1.0] - 2026-09-26

First public release.

- `agent`, `wait`, `send_message`, `list` and `stop` tools that run subagents on opencode models, defaulting to DeepSeek through opencode Go.
- Background runs with completion notifications, resume through `send_message`, and structured output.
- Uses the agent definitions in `.claude/agents` and the permission rules in Claude Code settings.
- Git worktree isolation under `.claude/worktrees/`.
- Permission modes. In auto mode only dangerous shell commands prompt, through MCP elicitation.
- Claude Code plugin with a skill that steers delegation.
