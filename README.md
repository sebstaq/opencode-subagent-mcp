# opencode-subagent-mcp

Run Claude Code subagents on [opencode](https://opencode.ai) models — for example
`opencode-go/deepseek-v4.1-flash` from an opencode Go subscription — while Claude Code
itself keeps talking to Anthropic directly.

It is a stdio MCP server. Your main Claude Code session is **not** proxied or routed
anywhere; the server only runs the subagents you delegate to it, on a private
`opencode serve` instance it starts itself.

## Install

```sh
git clone https://github.com/sebstaq/opencode-subagent-mcp
cd opencode-subagent-mcp
pnpm install && pnpm build
claude mcp add -s user opencode -- node "$PWD/dist/index.js"
```

Requires Node 22+, git, and the `opencode` CLI logged in to the providers you want
(`opencode auth login`).

## Tools

| Tool           | Native equivalent                  | What it does                                                         |
| -------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `agent`        | Agent tool                         | Run a subagent; returns its final report, usage and worktree outcome |
| `send_message` | SendMessage                        | Continue a finished agent with its full history                      |
| `wait`         | background completion notification | Collect a `run_in_background` agent (optionally with a timeout)      |
| `stop`         | TaskStop                           | Abort a running agent and return what it produced                    |
| `list`         | /agents                            | This session's agents, Claude agent definitions and opencode agents  |

`agent` parameters: `description`, `prompt`, `subagent_type`, `model`, `isolation: "worktree"`,
`permission_mode`, `tools`, `disallowed_tools`, `max_turns`, `effort`, `output_schema`,
`run_in_background`, `cwd`.

## Parity with native subagents

| Native behaviour                                           | Here                                                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fresh context, only the final message comes back           | Same. Long output is truncated (`maxResultChars`) with the full text written to a file                                                                                                     |
| Runs in the project directory                              | Same (cwd from MCP roots, then `CLAUDE_PROJECT_DIR`, then the server's cwd)                                                                                                                |
| `isolation: worktree`                                      | Same layout (`.claude/worktrees/<name>`, branch `worktree-<name>`, based on the default branch). Removed when unchanged, kept with commit/file summary otherwise. Outside paths are denied |
| Permission prompts surface in the main session             | opencode `ask` rules are shown as MCP elicitation dialogs (allow once / always / deny, with optional feedback)                                                                             |
| Permission modes                                           | `default`, `acceptEdits`, `auto`, `bypassPermissions`, `plan` mapped to opencode rules; your Claude `permissions.allow/ask/deny` from user, project and local settings apply               |
| Background agents with completion notification             | Claude Code moves long MCP calls to the background automatically and notifies when they finish; `run_in_background` + `wait` for explicit control                                          |
| Resume with full history                                   | `send_message` (also works for agents from earlier sessions, since opencode persists them)                                                                                                 |
| `.claude/agents/*.md` definitions                          | Used via `subagent_type`: prompt, `tools`, `disallowedTools`, `permissionMode`, `maxTurns`, `effort`, `isolation`. `model` applies only when it is an opencode `provider/model`            |
| `maxTurns` returns partial output                          | Same; status `max_turns`, resumable                                                                                                                                                        |
| Progress in the UI                                         | Tool calls are sent as MCP progress notifications                                                                                                                                          |
| Subagents cannot spawn subagents or ask the user questions | opencode's `task` and `question` tools are disabled                                                                                                                                        |
| Structured output                                          | `output_schema` (JSON Schema) → opencode structured output, returned as `structuredContent`                                                                                                |

Known gaps: agents do not appear in Claude Code's `/tasks` agent view; there is no
fork-with-parent-context; the Workflow tool's `agent()` cannot target them; `auto` mode has no
safety classifier (it allows everything except rules you configured and paths outside the
project, which ask); the parent's permission mode is not visible to MCP servers, so the default
comes from config; hooks, skills preloading, `memory` and per-agent MCP servers are not mapped.

## Configuration

Optional `~/.config/opencode-subagent-mcp/config.json` (or `$OPENCODE_SUBAGENT_CONFIG`):

```json
{
  "defaultModel": "opencode-go/deepseek-v4.1-flash",
  "defaultPermissionMode": "auto",
  "pure": true,
  "opencodeBin": "opencode",
  "maxConcurrent": 8,
  "maxResultChars": 80000
}
```

`OPENCODE_SUBAGENT_MODEL` and `OPENCODE_SUBAGENT_MODE` override the first two. `pure` starts
opencode without external plugins.

## How it works

On first use the server starts `opencode serve` on a random loopback port with a random
password, subscribes to its event stream, and drives one opencode session per agent
(agent id = session id). Permission requests from opencode are answered through MCP
elicitation. The opencode process is stopped with the MCP server; leftovers from crashed
servers are reaped on the next start.

## Development

```sh
pnpm check   # typecheck, lint, format check, unit tests
pnpm smoke [provider/model]   # end-to-end run against a real model in a temp repo
```

## License

MIT
