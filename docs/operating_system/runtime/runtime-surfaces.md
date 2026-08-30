# Runtime Surfaces

This document records provider-native deployment for rules, skills, root instructions, and hooks.

## Canonical Sources

| Source | Role |
| --- | --- |
| `docs/operating_system/rules/*.md` | Canonical rule authoring |
| `.agents/skills/*/SKILL.md` | Canonical reusable method authoring |
| `docs/operating_system/templates/agents/root-AGENTS.template.md` | Canonical root instruction source |
| `agents/*.toml` | Canonical agent-profile registry, including optional rank |
| `scripts/herdr_main_launcher.py` | Canonical runtime projection from a selected profile to one top-level Codex agent in Herdr |

## Generated Runtime Outputs

| Provider | Root instructions | Rules | Native skills | Hooks/settings |
| --- | --- | --- | --- | --- |
| Codex | `generated_agents/codex/AGENTS.md` | none | `generated_agents/codex/skills/<skill>/SKILL.md` | none |
| Codex delegated roles | `generated_agents/codex/agents/<role>.toml` | none | none | Deployed to `~/.codex/agents/` |
| DeepAgents delegated roles | Root `AGENTS.md` auto-loaded; user-local `dcode-project` materializes ignored `.deepagents/agents/<role>/AGENTS.md` only for launch, then cleans marker-owned views | Canonical `docs/operating_system/rules/*.md` read when task scope requires; `.agents/rules` is not auto-loaded | `.agents/skills/<skill>/SKILL.md` auto-discovered | Local runtime only; no MCP projection |
| Claude | `generated_agents/claude/CLAUDE.md` | `.agents/rules/*.md` | `generated_agents/claude/skills/<skill>/SKILL.md` | none |
| Antigravity/Gemini | `generated_agents/antigravity/GEMINI.md` | `.agents/rules/*.md` | `generated_agents/antigravity/skills/<skill>/SKILL.md` | none |

## Deployment Targets

| Provider | Deploy root | Notes |
| --- | --- | --- |
| Shared native skills | `~/.agents/skills` | Synced copy of repo-owned skills; repo remains authoring source. |
| Codex | `~/.codex` | Local deploy skips duplicate repo-owned skills. |
| DeepAgents | User-local `dcode-project` | Launcher reads active Codex provider binding and local secret source; `--role` selects the canonical profile model for primary launch; validates controller-owned handoff; forces `--no-mcp`; uses setup-script-pinned `deepagents-code` version; disables child auto-update. |
| Claude | `~/.claude` | Deploy includes generated native skills. |
| Antigravity/Gemini | `~/.gemini/antigravity` | Deploy includes generated native skills. |

## Policy

- Canonical repo sources remain source of truth.
- `agents/*.toml` owns profile/provider/model/instruction facts; `scripts/herdr_main_launcher.py` resolves and projects them; Herdr owns only top-level session/pane lifecycle and observation.
- Herdr probes use one resolved `CODEX_HOME`; the launcher passes it to Herdr and Codex child processes and blocks when project and home `hooks.json` both define `Stop` hooks.
- Launcher evidence separates registry/runtime projection, Git identity, Herdr observation, and launch-request binding facts; developer instructions are represented by digest, not raw text. Post-start readiness remains a separate CoS/Herdr observation.
- Positive `rank` values order only ranked profiles. Ranked profiles are ordered
  by registry rank; unranked profiles are explicit-only and non-orderable. Select
  executor and validator profiles independently from
  their bounded task contracts. A validator may be lower, equal, or higher than
  its executor when reliable for validation; specialized profiles may execute
  or validate based on task fitness.
- Generated runtime outputs remain deployable packaging surfaces.
- DeepAgents profile views are local generated runtime state, not primary profiles or tracked adapter output.
- DeepAgents auto-loads root `AGENTS.md` and discovers `.agents/skills` as
  project skills. It does not load `.agents/rules` as direct instructions;
  those files are generated platform-adapter views. Detailed rules remain
  canonical under `docs/operating_system/rules/` and are read when task scope
  requires them.
- DeepAgents built-ins are executor-local. Current launcher does not project
  Codex MCP servers, tool allowlists, approval, sandbox, shell, profile, or
  thread settings.
- Codex controller owns MCP calls and writes `codex.mcp.handoff.v1` under
  `%USERPROFILE%\.local\share\dcode-project\handoffs`; `dcode-project` validates
  handoff path, age, schema, source IDs, capability digest, and sensitive-field
  exclusions, then injects only sanitized sources, facts, and constraints into
  task text before launching DeepAgents. `--mcp-select` narrows provenance
  only; it does not make MCP tools available inside DeepAgents.
- DeepAgents web search is executor-local and needs user-local `TAVILY_API_KEY`.
  It is absent by default and never falls back to Codex browser or web MCP tools.
- Project `.env` files are untrusted runtime input. Launcher-owned provider
  environment values win, and project files must not carry credentials or
  runtime authority.
- Reusable operating methods live in skills; prompts remain wording-only.
