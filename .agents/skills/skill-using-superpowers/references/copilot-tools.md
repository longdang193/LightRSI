# Copilot CLI Tool Mapping

Skills speak in actions ("dispatch a subagent", "create a todo", "read a file"). On Copilot CLI these resolve to the tools below.

| Action skills request | Copilot CLI equivalent |
|----------------------|------------------------|
| Read a file | `view` |
| Create / edit / delete a file | `apply_patch` |
| Run a shell command | `bash` |
| Search file contents | `rg` |
| Find files by name | `glob` |
| Fetch a URL | `web_fetch` |
| Search the web | `web_search` |
| Invoke a skill | `skill` |
| Dispatch a subagent (`Subagent (general-purpose):` template) | `task` with `agent_type: "general-purpose"` |
| Multiple parallel dispatches | Multiple `task` calls in one response |
| Subagent status / output / control | `read_agent`, `list_agents`, `write_agent` |
| Task tracking ("create a todo", "mark complete") | `update_todo` |

## Instructions file

When a skill mentions "your instructions file", on Copilot CLI this is **`AGENTS.md`** at the repository root. If both `AGENTS.md` and `.github/copilot-instructions.md` are present, Copilot reads both.

## Personal skills directory

User-level skills live at **`~/.copilot/skills/`**. Copilot CLI also recognizes **`~/.agents/skills/`**.
