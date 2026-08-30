# Claude Code Tool Mapping

Skills speak in actions ("dispatch a subagent", "create a todo", "read a file"). On Claude Code these resolve to the tools below.

## Tools

| Action skills request | Claude Code tool |
|----------------------|------------------|
| Read a file | `Read` |
| Create a new file | `Write` |
| Edit a file | `Edit` |
| Run a shell command | `Bash` |
| Search file contents | `Grep` |
| Find files by name | `Glob` |
| Fetch a URL | `WebFetch` |
| Search the web | `WebSearch` |
| Invoke a skill | `Skill` |
| Dispatch a subagent (`Subagent (general-purpose):` template) | `Agent` (older releases named this `Task`) |
| Multiple parallel dispatches | Multiple `Agent` calls in one response |
| Task tracking ("create a todo", "mark complete") | `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`; `TodoWrite` in `claude -p` / Agent SDK unless `CLAUDE_CODE_ENABLE_TASKS=1` is set |
| Background-process / subagent lifecycle (read output, cancel) | `TaskOutput`, `TaskStop` |

## Instructions file

When a skill mentions "your instructions file", on Claude Code this is **`CLAUDE.md`**. Claude Code walks up the directory tree from the current working directory and concatenates every `CLAUDE.md` and `CLAUDE.local.md` it finds along the way.

Claude Code does **not** read `AGENTS.md` directly. If a project already maintains `AGENTS.md` for other agents, import it from `CLAUDE.md` so both runtimes share the same instructions.

## Personal skills directory

User-level skills live at **`~/.claude/skills/`**. Each skill is a subdirectory containing a `SKILL.md` plus any supporting files.
