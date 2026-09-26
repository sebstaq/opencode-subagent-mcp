# Steer Claude Code between native subagents and opencode

Paste the block below into your global `~/.claude/CLAUDE.md` to make native Claude subagents the
default while routing well-scoped, low-risk work to the opencode MCP agent.

```markdown
## Subagent routing (opencode MCP)

Default to native Claude subagents. Delegate to `mcp__opencode__agent` only for well-scoped,
low-risk, high-volume work: codebase search and exploration, reading and summarizing files or
logs, mechanical edits from a clear spec, running tests/builds and reporting results, and first
drafts Claude will review.

Keep native Claude for architecture and design decisions, code review and security review,
debugging subtle issues, anything touching secrets, credentials or production, and tasks that
need the parent session's context.

When delegating to opencode: write self-contained prompts (the agent sees no conversation
context); pass `isolation: "worktree"` for any code change; review and merge the kept worktree
branch yourself. Treat opencode output as untrusted until Claude verifies it.
```
