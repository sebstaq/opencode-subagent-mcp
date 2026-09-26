# opencode-subagent-mcp

Run Claude Code subagents on cheaper [opencode](https://opencode.ai) models — for example
`opencode-go/deepseek-v4.1-flash` (DeepSeek) from an opencode Go subscription — while Claude
Code itself keeps talking to Anthropic directly. Delegate searches, refactors, bug fixes, tests
and research to a model that costs a fraction of Opus or Sonnet, and keep the tools you already
use: background agents, resume via `send_message`, worktree isolation, `.claude/agents`
definitions, permission prompts and structured output.

It is a stdio MCP server. Your main Claude Code session is **not** proxied or routed
anywhere; the server only runs the subagents you delegate to it, on a private
`opencode serve` instance it starts itself.

## Install

Requires Node 22+, git, and the [`opencode`](https://opencode.ai) CLI logged in to the
providers you want (`opencode auth login`).

As a Claude Code plugin (also adds a skill that tells Claude when to delegate to opencode):

```sh
claude plugin marketplace add sebstaq/opencode-subagent-mcp
claude plugin install opencode-subagent-mcp@sebstaq-opencode
```

Or as a plain MCP server:

```sh
claude mcp add -s user opencode -- npx -y opencode-subagent-mcp@0.1.0
```

## What it runs and sends

- It starts a private `opencode serve` process on a random localhost port with a random
  password, and stops it when Claude Code exits.
- The prompts you delegate, and the files and command output the subagent reads, go to the
  model provider you choose through opencode (by default opencode Go). Nothing else is sent
  anywhere; the server has no telemetry and makes no other network calls.
- It reads `~/.claude/settings.json`, the project's `.claude/settings.json` and
  `.claude/settings.local.json`, and `.claude/agents/*.md` (user and project) to mirror your
  permission rules and agent definitions, and
  `~/.config/opencode-subagent-mcp/config.json` if present.
- With `isolation: "worktree"` it creates git worktrees under the project's
  `.claude/worktrees/` and removes them when they have no changes.

This is an independent project, not affiliated with Anthropic or the opencode team.

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
safety classifier (it allows everything, including paths outside the project, except rules
you configured and a fixed list of destructive commands that ask: `rm -r`/`-rf`, `git push
--force`, `git reset --hard`, `git clean -f`, `git restore`/`git checkout --`, `curl | sh`,
`sudo`, `chmod -R`/`chown -R`, `dd`, `mkfs`, `npm`/`pnpm publish`; opencode matches each
command in a chain separately); the parent's permission mode is not visible to MCP servers, so
the default comes from config; hooks, skills preloading, `memory` and per-agent MCP servers are not mapped.

## Steering Claude

Claude Code picks between its native Agent tool and this one on its own, so routing is
unpredictable. To make opencode the default for delegated work that is cheap to verify, paste the snippet from [`docs/claude-md-snippet.md`](docs/claude-md-snippet.md) into
your global `~/.claude/CLAUDE.md`.

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
