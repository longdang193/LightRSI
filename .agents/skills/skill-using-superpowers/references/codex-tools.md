# Codex Tool Mapping

Skills speak in actions ("dispatch a subagent", "create a todo", "read a file"). On Codex these resolve to the tools below.

| Action skills request | Codex equivalent |
|----------------------|------------------|
| Read a file | `functions.exec_command` with `Get-Content`, `type`, `cat`, `head`, or `tail` |
| Create / edit / delete a file | `apply_patch` |
| Run a shell command | `functions.exec_command` |
| Search file contents | `functions.exec_command` with `rg` or `grep` |
| Find files by name | `functions.exec_command` with `rg --files`, `find`, or `ls` |
| Fetch a URL | `functions.exec_command` with `curl` / `wget`, or `web.open` when browsing is appropriate |
| Search the web | `web.search_query` |
| Invoke a skill | Skills load natively — just follow the instructions |
| Dispatch a subagent (`Subagent (general-purpose):` template) | `spawn_agent` |
| Multiple parallel dispatches | Multiple `spawn_agent` calls in one response |
| Wait for subagent result | `wait_agent` |
| Free up subagent slot when done | `close_agent` |
| Task tracking ("create a todo", "mark complete") | `update_plan` |

## Instructions file

When a skill mentions "your instructions file", on Codex this is **`AGENTS.md`** at the project root. Codex also reads `~/.codex/AGENTS.md` for global context, and an `AGENTS.override.md` (in the project tree or `~/.codex/`) takes precedence when present. Codex walks from the project root down to the current working directory, concatenating `AGENTS.md` files it finds along the way.

## Personal skills directory

User-level skills live at **`$CODEX_HOME/skills/`** (default `~/.codex/skills/`). Codex also reads the cross-runtime path **`~/.agents/skills/`**. When both directories exist at the same scope, Codex loads them both as separate skill catalogs. Each skill is a subdirectory containing a `SKILL.md`.

## Subagent dispatch requires multi-agent support

Add to your Codex config (`~/.codex/config.toml`):

```toml
[features]
multi_agent = true
```

This enables `spawn_agent`, `wait_agent`, and `close_agent` for `skill-dispatching-parallel-agents` when independent lanes justify delegation.

Legacy note: older Codex builds exposed spawned-agent waiting as `wait`. Current Codex uses `wait_agent` for spawned agents.

## Environment Detection

Skills that create worktrees or finish branches should detect their environment with read-only git commands before proceeding:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

- `GIT_DIR != GIT_COMMON` → already in a linked worktree (skip creation)
- `BRANCH` empty → detached HEAD (cannot branch/push/PR from sandbox)

## Codex App Finishing

When the sandbox blocks branch/push operations (detached HEAD in an externally managed worktree), the agent commits all work and informs the user to use the App's native controls:

- **"Create branch"** — names the branch, then commit/push/PR via App UI
- **"Hand off to local"** — transfers work to the user's local checkout

The agent can still run tests, stage files, and output suggested branch names, commit messages, and PR descriptions for the user to copy.
