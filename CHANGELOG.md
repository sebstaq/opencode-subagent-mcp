# Changelog

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
