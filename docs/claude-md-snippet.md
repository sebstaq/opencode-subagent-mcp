# Steer Claude Code between native subagents and opencode

Paste the block below into your global `~/.claude/CLAUDE.md` to route most delegated work to the
opencode MCP agent, keeping native Claude subagents for work that is as costly to verify as to do.

```markdown
## Subagent Routing (opencode MCP)

- Default to `mcp__opencode__agent` (DeepSeek via opencode) for most delegated work. It is capable, and moving usage there is a goal, so do not undersell it or reserve it for trivial tasks.
- Good fits include implementing features from a clear goal, refactors, bug fixes, writing tests, codebase and docs research, investigations, running and fixing builds/tests, and drafting docs.
- The test: can the dispatcher verify the result clearly cheaper than doing the work with a native subagent (read the diff, run the tests, spot-check cited sources)? If yes, use opencode.
- Use a native Claude subagent when verifying would cost about as much as doing the work (open-ended architecture decisions, subtle debugging where the reasoning is the deliverable, reviews you would have to redo to trust), or when the task needs the parent conversation's context.
- When delegating to opencode:
  - Write self-contained prompts with the goal, constraints and how to verify.
  - Use `isolation: "worktree"` for code changes and merge the kept branch after review.
  - Review in proportion to risk: spot-check, don't redo.
```
