# Native Personal-Local Worktree Procedure

Use `native-personal-local` for ordinary work by one trusted local OS user.
Git owns workspace identity and change evidence. Selected local executor is
Codex, DeepAgents, or Tura; Codex is safe default when plan omits executor or
delegated benefit is unclear. Follow
`docs/operating_system/planning/planning-dispatch.md` for advisory executor
selection. Executor choice does not change task paths, Git acceptance, or user
approval. It can change host-enforced tool containment; current DeepAgents
containment is not a Codex permission projection.

Git-tracked coordinated work follows
`docs/operating_system/rules/git-tracked-coordination-rule.md`. This procedure
owns commands and recovery mechanics; the rule owns coordination invariants.

## Start

Before work, record task objective, repository-relative allowed paths, base
commit, declared checks, and preauthorized local actions. Missing any item
means `block`.

Task contract may preauthorize only bounded local actions: edits within allowed
paths, declared checks, configured Codex MCP calls within existing permissions,
approved workspace creation or reuse, bounded DeepAgents execution, and verified
local checkpoint commits. Preauthorization never expands technical permissions.
Stop for scope, base, workspace, or required-check changes; credentials or
personal-profile access; external writes not named in contract; push, merge,
release, or publication without an exact active-plan lane grant; exceptional
base mutation, force push, retargeting, protection bypass, semantic conflict
resolution, destructive Git recovery, discard, cleanup outside that grant, or
worktree removal.

Run every controller command with selected absolute workspace:

```powershell
$workspace = (Resolve-Path .).Path
$base = (git -C $workspace rev-parse HEAD).Trim()
git -C $workspace rev-parse --show-toplevel
git -C $workspace status --short --branch
git -C $workspace worktree list --porcelain
```

Follow
[`skill-using-git-worktrees`](../../../.agents/skills/skill-using-git-worktrees/SKILL.md):

- Reuse clean current checkout for small reversible work.
- Create or reuse native Git worktree only when task contract preauthorizes
  isolation and current changes, task risk, or concurrent writers require it.
- Record absolute workspace, creation mechanism, branch or detached state,
  base, current `HEAD`, and preserved pre-existing changes.

Start selected local executor only from actual selected-workspace context. If
context cannot be proved, work directly in selected workspace or `block`.

For delegated profiles, `agents/*.toml` owns profile prompts, provider aliases, models,
and optional ranks. Positive ranks order only ranked profiles; unranked profiles
are explicit-only and non-orderable. Ranked profiles are ordered by registry
rank. Codex consumes deployed
TOML. User-local `dcode-project` materializes ignored `.deepagents/agents/`
views at launch with local provider endpoint and credentials. Each profile provider
alias must match active local Codex provider. Select executor and validator
profiles independently from their bounded task contracts; a lower, equal, or
higher validator profile is valid when reliable for the validation task. It is
not a `dcode --agent` primary profile.

DeepAgents auto-loads root `AGENTS.md` and discovers `.agents/skills` as
project skills. It does not directly load `.agents/rules`; those are generated
adapter views, not DeepAgents instruction inputs. When delegated work needs a
detailed rule beyond root instructions, name and read canonical
`docs/operating_system/rules/<rule>.md` in task scope. Do not create a duplicate
`.deepagents/AGENTS.md` rule bundle.

`dcode-project` reads its endpoint from active user-local Codex provider
configuration and its API key from user-local secret configuration. Never add
provider bindings, credentials, tier-model aliases, MCP config, hooks, memories,
threads, or generated `.deepagents/` files to repository coordination.

## DeepAgents Tool Boundary

Current `dcode-project` consumes required `--role <profile>`,
resolves that selected profile's provider alias and model, then validates a
controller-owned sanitized handoff. It starts `dcode` with selected profile model
and `--no-mcp`; Codex MCP servers, their tool allowlists, approval policy,
sandbox mode, and shell policy do not transfer. The top-level Codex model remains
controller default; it does not select a DeepAgents profile model.
DeepAgents capabilities depend on launch mode and task context. Current
`dcode-project` supplies a fixed launcher-owned bounded tool surface; callers
cannot widen it through task text or runtime-authority flags. Never assume a
delegated `task` inherits any capability beyond the explicit launcher and task contract;
provide required immutable inputs and verify returned evidence. Web search needs
user-local `TAVILY_API_KEY`; its absence disables web search and does not fall
back to Codex browser or web MCPs.
Keep DeepAgents work inside trusted one-user workspace, retain controller path
checks, and verify Git scope before acceptance.

## Bounded Tura Worker

`project-delegate` is the explicit Native Codex adapter for one bounded Tura
worker. It uses the same `agents/*.toml` profile registry and controller-validated
handoff, but Native Codex retains MCP, approval, Git, verification, and
acceptance. Tura receives fixed Git root, native `--sandbox`, fresh session id,
and opaque JSONL; it cannot spawn another worker. `dcode-project` remains
DeepAgents and does not silently switch runtimes.

Tura-enabled setup requires one paired executable/provider-config path:

```powershell
./scripts/setup_deepagents_runtime.ps1 -SecretFile <local-env-file> `
  -TuraExecutable <tura-executable> -TuraProviderConfig <tura-provider-config>
```

Setup probes required public CLI flags once, writes one user-local config, and
installs `project-delegate`. Restart needs no manual action. Production route
follows the canonical runtime adapter procedure through `TURA_PROVIDER_CONFIG`;
moving the executable requires setup rerun, replacing it at the same path does
not.
After replacing the executable, run
`project-delegate --role normal --print-config` to capture its nonsecret
`tura_executable_sha256`, then run one bounded read-only TL smoke. Treat prior
performance evidence as stale when hash changes; do not add release-specific
config or adapter code.

Launch with `project-delegate --role <profile> -n "<task>"`.
Use `dcode-project` when DeepAgents is required explicitly.

DeepAgents controller may use built-in `task` for any discovered profile,
including specialized profiles. Profiles are capability profiles, not fixed task roles.
Controller defines open-ended task function through prompt and selects profile
from required reasoning depth, ambiguity, scope, risk, and cost. Do not map
research, debugging, review, design, planning, implementation, validation,
orchestration, or any other function to one fixed profile. Name function and
selected profile in task prompt; do not use `dcode --agent` or `dcode -r` for
project coordination. Same profile registry, Git scope, plan
coordination, task evidence, checks, and acceptance rules apply to Codex and
DeepAgents delegates; executor containment and approval remain distinct.

For DeepAgents parallel preflight followed by sequential final validation, use
existing plan tasks and waves; do not add a DeepAgents-specific orchestration
schema. `Execution Approach` selects `parallel-capable`; task `Dependencies` and
`Files And Symbols` own immutable inputs; `Parallel ownership` and task paths own
write ownership; wave order and task dependencies form barrier; task and plan
verification plus `skill-verification-before-completion` own final validation.
Dispatch independent tasks through `skill-dispatching-parallel-agents`, then run
dependent final-validation task only after fan-in. Same-workspace final validator
must not overlap writer. If independence, ordering, or final state cannot be
proved, use recorded sequential fallback.

DeepAgents local runtime state may support temporary diagnostics such as task
timing or failure analysis. It is not repository coordination state, durable
acceptance evidence, or required recovery input. Plan plus Git remain SSOT.

`dcode-project` consumes its own required `--role` selector and rejects direct
model/profile, agent/thread, MCP/hook trust,
approval/Yolo, sandbox, shell/filesystem/interpreter, startup, install, and ACP
flags. It allows only bounded task flags such as `--max-turns`, `--timeout`,
`--rubric`, `--goal`, and output controls. Codex controller performs MCP calls,
then writes handoff under `%USERPROFILE%\.local\share\dcode-project\handoffs`.
Launch with `--handoff-file <absolute-path>` and optional repeatable
`--mcp-select <server[.tool][,server[.tool]...]>`; selection narrows provenance
only and never grants DeepAgents tools. Handoff schema is
`codex.mcp.handoff.v1`; `dcode-project` validates file, injects only validated
sanitized sources, facts, and constraints into task text, and never requires
DeepAgents to open host path. Controller deletes handoff after use. Never pass
credentials, tool configs, raw headers, cookies, or approval authority through
task text.

Launch a task without controller facts with:

```powershell
dcode-project --role <profile> -n "<task>"
```

When Codex passes validated facts, use:

```powershell
dcode-project --role <role> --handoff-file <absolute-path> -n "<task>"
```

Do not pass raw `--stdin` or pipe task text to `dcode-project`; only validated
`--handoff-file` launches create DeepAgents stdin. DeepAgents built-in file tools
receive exact native file-tool root in every bounded task. On Windows it looks
like `/Users/<user>/repos/<repo>`; append repository-relative paths to that
root. Never guess `/workspace/...` or use Windows drive syntax. Launcher fixes
child CWD to Git root and gives DeepAgents built-in filesystem tools plus `git`
and `py` shell commands. Callers cannot widen those capabilities. Read only
named source, test, and text files with filesystem tools. Never use them on
database, binary, archive, or runtime artifacts; examples include `*.sqlite`,
`*.sqlite3`, `*.db`, `*-wal`, `*-shm`, `*-journal`, archives, images, and media.
For SQLite evidence, use `py` from repository root with stdlib `sqlite3` in
read-only URI mode: `sqlite3.connect("file:<repo-relative-path>?mode=ro",
uri=True)`. Run `py` directly; do not prefix it with `cd`, shell operators, or
wrappers. For `py -c`, use one expression; never use `;`. Ask for
repository-relative `path:line` evidence. When a task needs an acceptance
decision, require `PASS`, `FAIL`, or `BLOCKED` first.

Install or refresh local DeepAgents runtime:

```powershell
./scripts/setup_deepagents_runtime.ps1 -SecretFile <local-env-file>
```

Installer writes only `%USERPROFILE%\.local\share\dcode-project\` runtime state
and `%USERPROFILE%\.local\bin\dcode-project.{cmd,ps1}`. The pinned DeepAgents
tool stays isolated under the runtime root, so concurrent repositories do not
replace one shared `dcode.exe`. Wrapper resolves current Git workspace and runs
tracked `scripts/dcode_project.py`. Run `dcode-project`
from selected repository workspace with `--role <profile>`; do not
pass `--model`. Setup uses the version pinned by
`scripts/setup_deepagents_runtime.ps1`, requires Python 3.12 or newer, verifies
the installed `dcode` version, and disables child auto-update.
Setup fails when
`%USERPROFILE%\.deepagents\.mcp.json` exists; remove that direct DeepAgents MCP
config before setup so Codex config remains sole MCP authority.

DeepAgents may load project `.env` values. `dcode-project` overwrites provider
environment values from its local Codex binding before launch and keeps MCP
disabled; do not store credentials or runtime authority in project files.
Inspect effective DeepAgents settings with `dcode config` or `dcode config path`.

## DeepAgents Probe Selection

Routine probes run after launcher or guidance changes: one bounded task, one
declared failure or timeout cleanup, and controller-owned Git recovery.
Extended probes run only after parallelism, worktree, runtime-binding, handoff,
role-generation, or cleanup changes. Tests own deterministic boundaries; live
probes own installed-runtime, provider, concurrency, and cleanup evidence.

Herdr probes pass one disposable `--codex-home` per probe. Keep only one active
`Stop` hook scope: selected home or probe worktree `.codex/hooks.json`, never
both.

Use OS temporary directories, never starter workspace. Record probe ID,
temporary workspace, base, executor/profile, exit code, elapsed time, changed
paths, checks, decision, and notes. Preserve failed-probe evidence. Remove
only exact resolved probe roots after capture; do not track fixtures, handoffs,
or `.deepagents/` state.

After a runtime upgrade, run this bounded smoke probe from selected repository:

```powershell
dcode-project --role normal --no-mcp --json --max-turns 4 --timeout 120 -n "Return exactly DEEPAGENTS_UPGRADE_OK"
```

Accept only when exit code is `0`, output contains `DEEPAGENTS_UPGRADE_OK`,
selected model is `combo-normal`, and `.deepagents/` is absent after exit. Run
`dcode-doctor` separately when checking Windows diagnostics. It uses the
isolated pinned executable and forces ASCII glyphs for legacy Windows consoles.

## Resume In A New Task

Git-tracked coordinated work requires static `Coordination State` and task ledger
in its plan. Ordinary uncoordinated personal-local work may omit them. One lead
controller resumes coordinated work only through plan plus Git. Do not use Codex
thread IDs, DeepAgents thread IDs, or `dcode -r` as repository coordination state.

1. Open plan from selected workspace and identify recorded branch, base, active
   task or dependency-ready wave, expected workspace, next action, and blockers.
2. Run `git rev-parse --show-toplevel`, `git status --short --branch`,
   `git worktree list --porcelain`, and `git rev-parse HEAD`.
3. Compare current branch, base ancestry, `HEAD`, and workspace changes with
   plan coordination state.
4. Read task ledger. Resume recorded active task or active dependency-ready wave,
   or first dependency-ready `pending` task when none is active.
5. Derive latest checkpoint from Git when needed with
   `git log -1 --format=%H -- <plan-path>`. Re-run declared proof for last
   completed task when commit history or current changes make prior evidence
   uncertain.
6. Record reconciled task, workspace, evidence summary, and next action in plan.
   Only lead controller updates coordination state or task ledger.
7. `block` before implementation on plan/Git mismatch, active tasks outside one
   declared dependency-ready wave, unknown checkpoint, out-of-scope changes, or
   unresolved blocker.

When task contract preauthorizes verified checkpoint commits, completed task
changes and lead-controller ledger update share one checkpoint commit after
task-local proof. Git owns checkpoint identity; do not copy the resulting SHA
into the plan. An exact active-plan lane grant may authorize lane push, PR
create/update, assigned review action, exact approved PR merge, and cleanup;
exceptional or destructive actions still require explicit user authorization.

## Check And Review

Run declared checks from selected workspace. Keep Git-owned evidence:

```powershell
git -C $workspace diff --name-status -z -M -C --find-copies-harder $base --
git -C $workspace diff --name-status -M -C --find-copies-harder $base --
git -C $workspace ls-files --others --exclude-standard -z
```

Review every emitted path against declared paths. For `R` or `C`, review both
source and destination paths. Include tracked, staged, unstaged, deleted,
renamed, copied, type-changed, and untracked changes.

Record `block` and preserve workspace and evidence when a declared command or
check fails; paths are unsafe or outside scope; a conflict, nested repository,
or submodule change exists; workspace context is uncertain; or required Git
evidence is missing.

When checks and scope proof pass, controller records `accept` or `block` in task
handoff. `accept` hands off only to
[`skill-finishing-a-development-branch`](../../../.agents/skills/skill-finishing-a-development-branch/SKILL.md)
for plan-granted lane publication or integration and user-authorized keep,
exceptional merge, discard, or cleanup. A verified local checkpoint commit is
permitted only when task contract preauthorized it.
`block` changes no Git state. Recovery or destructive discard needs separate
explicit authorization.

Neither disposition commits beyond a task-preauthorized checkpoint, merges,
pushes, releases, stashes, resets, cleans, prunes, removes, or force-removes a
worktree without an applicable active-plan lane grant or explicit user
authorization.

## Docker Boundary

Use Docker only when repository already owns declared setup or check commands.
This procedure never creates, starts, stops, or manages containers.
