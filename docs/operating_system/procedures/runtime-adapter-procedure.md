# Runtime Adapter Procedure (Cross-Tool)

## Contract

1. `AGENTS.md` is the generated shared global baseline contract.
2. `~/.codex`, `~/.claude`, `~/.gemini` are runtime targets.
3. Runtime targets are generated and deployed only.
4. Canonical edits happen in repo sources only:
   - scoped `AGENTS.md` files, when present
   - `docs/operating_system/`
   - `.agents/skills/`
   - `agents/*.toml`
   - `docs/operating_system/templates/agents/root-AGENTS.template.md`

Scoped `AGENTS.md` files are canonical instructions for their directories.
`docs/operating_system/rules/` is canonical rule source. Adapter sync mirrors it
to `.agents/rules/` for supported local runtimes.

## Runtime Recovery and Proof

For a local MCP or daemon-backed runtime:

1. Discover the live endpoint through its IPC or status channel. Do not trust a
   stale port, PID, or marker file without probing it.
2. If IPC is missing or the parent process died, restart the owning runtime and
   reconnect the client. Do not edit generated runtime files to hide stale
   state.
3. Prove transport with one successful tool call. `active:false` alone is not a
   transport result.
4. For asynchronous work, preserve the run ID, poll to terminal state, and
   verify artifacts or output paths. Tool-call success is not completion proof.
5. If shutdown cancels active work, preserve the run record and lifecycle logs.
   Fix ownership in the runtime provider; do not patch the consuming project.
6. Treat closed-parent `EPIPE` and missing-pipe errors as transport incidents.
   Keep logging best-effort so diagnostic output cannot terminate its owner.

Shared skills deployed to `~/.agents/skills/<skill>` carry a
`.project-os-managed` JSON marker with schema, source root, and source-relative
skill path. Deploy updates and removes only markers owned by the current repo.
Unmarked byte-identical skills are adopted automatically; differing unmarked
skills require `--adopt-shared-skill <name>`. `--force` remains for provider
runtime overwrite protection and is not shared-skill adoption authorization.

`agents/*.toml` is the canonical agent-profile registry. It owns delegated
provider alias, model, optional rank, and prompt. Positive ranks order only
ranked profiles; unranked profiles are explicit-only and non-orderable. Current
ranked profiles are ordered by registry rank; specialized profiles may use
another name and model.
Select executor and validator profiles independently from their bounded task
contracts. A validator may be lower, equal, or higher than its executor when
reliable for the validation task.
Sync renders Codex TOML into
`generated_agents/codex/agents/`. User-local `dcode-project` generates ignored
DeepAgents project views at launch. Keep provider endpoints, credentials, MCP
configuration, and provider definitions out of role templates and tracked
outputs.

## Generate

```bash
python scripts/sync_agent_adapters.py --all-platforms
```

Outputs:

- `generated_agents/codex/`
- `generated_agents/claude/`
- `generated_agents/antigravity/`

## Deploy

```bash
python scripts/deploy_agent_runtime.py --target all
```

Targets:

- `~/.codex`
- `~/.claude`
- `~/.gemini`

DeepAgents is not an adapter-sync target. User-local `dcode-project` derives
ignored project subagents from `agents/*.toml` at launch. Every task launch
requires `--role <profile>`; launcher consumes this selector and
uses the selected profile's model for its primary `dcode -M` binding. Its
provider endpoint, credentials, provider definition, and mutable state remain
local. Each selected profile's `model_provider` must match active local Codex provider
binding.
Profiles may set `deepagents_compatible = false` when their provider model does
not return the Responses API shape required by DeepAgents; `dcode-project`
rejects that pairing before child launch, while Tura and native Codex remain
independent paths.

`project-delegate` is the one bounded Native Codex-to-Tura adapter. Its wrapper
rejects `--executor` and forces `--executor tura`; `[delegation].default_executor`
is only an internal launcher fallback. It reuses the same role and handoff
sources and passes one bounded task with fixed Git root, native `--sandbox`, and
fresh session id. Tura output remains opaque JSONL plus exit status.
`dcode-project` remains an explicit DeepAgents launcher; no recursive or
cross-runtime fallback exists. Tura routing uses
`TURA_PROVIDER_CONFIG` and must remain `Tura -> LightRSI -> 9router -> provider`.

For upgrade admission, run `project-delegate --role normal --print-config` and
record the reported `tura_executable_sha256` when the executable exists. The
receipt contains no credentials. Replacing the binary at the configured path
needs no setup rerun; moving it needs one setup rerun. Run one bounded,
read-only TL smoke after every binary replacement before reusing compatibility
or performance evidence. A changed hash invalidates old performance evidence,
not necessarily the adapter contract.

Current `dcode-project` forces DeepAgents `--no-mcp`, fixes child CWD to selected
Git root, and rejects direct runtime-authority flags. It does not translate Codex
`mcp_servers`, approval policy, sandbox mode, profiles, or threads. It supplies
fixed launcher-owned built-ins: filesystem tools plus `git` and `py` shell
commands; task input cannot widen them. Launcher injects exact native file-tool
root into every bounded task. On Windows it looks like
`/Users/<user>/repos/<repo>`; append repository-relative paths. Never guess
`/workspace/...` or use Windows drive syntax. It also injects filesystem safety:
read source, test, and text files only; inspect SQLite only through `py` with
stdlib `sqlite3` read-only URI mode and direct `py` commands only. `py -c` must
use one expression with no `;`. Call MCP through Codex, then let
`dcode-project` validate `codex.mcp.handoff.v1` and inject only sanitized
sources, facts, and constraints into task text. Setup rejects a
user-local `~/.deepagents/.mcp.json` to prevent an accidental direct MCP path.
The setup script owns the tested `deepagents-code` version, requires Python
3.12 or newer, verifies `dcode --version`, and disables automatic child updates. Use the setup
script for upgrades; do not rely on floating `uv tool install deepagents-code`
or `dcode --update`.

The pinned executable stays under the user-local `dcode-project` runtime root;
do not depend on or replace a global `dcode.exe`. Current DeepAgents may load project `.env` files. Launcher-owned provider
environment values override inherited project values, while MCP remains disabled.
Treat project `.env` and `.deepagents/` content as untrusted runtime input.

## Drift Checks

Generated drift:

```bash
python scripts/sync_agent_adapters.py --all-platforms --check
```

Runtime drift:

```bash
python scripts/validate_agent_runtime_drift.py --all-platforms
```

Switchyard auto runtime:

```bash
py scripts/manage_switchyard_runtime.py check --codex-config "$HOME/.codex/config.toml" --codex-home "$HOME/.codex" --switchyard-home "$HOME/.switchyard"
py scripts/manage_switchyard_runtime.py deploy --codex-config "$HOME/.codex/config.toml" --codex-home "$HOME/.codex" --switchyard-home "$HOME/.switchyard"
```

`repo_config/switchyard-routing.toml` owns automatic policy. `agents/*.toml`
own provider aliases and model IDs. Generated `$HOME/.switchyard/routes.toml`
and `$CODEX_HOME/auto.config.toml` are runtime outputs; deploy refuses drift
unless explicit migration uses `--replace-existing`. The generated upstream
client names `SWITCHYARD_API_KEY` as its credential environment variable but
never stores its value. `low` and `xhigh` remain fixed/manual. `normal` and
`high` may be selected directly or serve as the endpoints underneath `auto`.

`auto` is an opt-in runtime routing mode, not a capability or validator profile.
Policy v1 routes only between `normal` and `high`; no cost-savings claim is
established. The current runtime uses `capable_first` pending calibration, and
the compatibility smoke—not the version field alone—is the compatibility gate.

`auto` is eligible only for the Native Codex controller. It changes model
endpoint selection inside that controller route; it never selects Codex,
DeepAgents, or Tura and is not consumed by `dcode-project` or
`project-delegate`. The generated `auto.config.toml` is a separate explicit
Codex launch overlay; deploying it does not change fixed delegated-role
bindings.

| Executor or surface | Fixed profiles | `auto` |
| --- | --- | --- |
| Native Codex controller | discovered profile | yes |
| Native Codex delegated worker | discovered profile | no |
| DeepAgents task or internal worker | discovered profile | no |
| Tura worker | discovered profile | no |

Executor selection answers who executes. Profile selection answers the bounded
capability contract. `auto` answers which eligible ranked model endpoint to use.

CI-safe (skip home-directory check):

```bash
python scripts/validate_agent_runtime_drift.py --all-platforms --skip-deploy-check
```

## Metadata Schema Validation

```bash
python scripts/validate_agent_metadata_schema.py
```

Schema source:

- `docs/operating_system/runtime/agent-runtime-metadata-schema.md`
