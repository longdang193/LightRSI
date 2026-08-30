# Antigravity CLI (`agy`) Tool Mapping

Skills speak in actions ("dispatch a subagent", "create a todo", "read a file"). On Antigravity CLI (`agy`) these resolve to the tools below.

| Action skills request | Antigravity CLI equivalent |
|----------------------|----------------------------|
| Read a file | `view_file` |
| Create a new file | `write_to_file` |
| Edit a file | `replace_file_content` |
| Edit a file in several places at once | `multi_replace_file_content` |
| Run a shell command | `run_command` |
| Search file contents | `grep_search` |
| Find files by name / list a directory | `list_dir` |
| Fetch a URL | `read_url_content` |
| Search the web | `search_web` |
| Pose a structured question to the user | `ask_question` |
| Dispatch a subagent (`Subagent (general-purpose):` template) | `invoke_subagent` |
| Multiple parallel dispatches | Multiple entries in one `invoke_subagent` call |
| Task tracking ("create a todo", "mark complete") | A task artifact written with `write_to_file` |

## Invoking a skill

Antigravity has no `Skill` / `activate_skill` tool. To load a skill, read its `SKILL.md` with `view_file`, setting `IsSkillFile: true`.

## Subagent support

Antigravity supports built-in `self` and `research` subagent types. Use `self` for implementation work and `research` for read-only review.
