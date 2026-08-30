from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_chief_of_staff_has_single_required_read_and_clear_ownership() -> None:
    skill = read(".agents/skills/skill-chief-of-staff/SKILL.md")
    assert "name: skill-chief-of-staff" in skill
    assert "required_reads:\n  - docs/operating_system/rules/git-tracked-coordination-rule.md" in skill
    assert "`skill-executing-plans` owns\napproved-plan execution" in skill
    assert "CoS has no direct Git or PR authority" in skill
    assert "`deepagents` uses\n`dcode-project`" in skill
    assert "`tura` uses\n`project-delegate`" in skill


def test_chief_of_staff_has_deterministic_binding_runtime_and_status_contract() -> None:
    skill = read(".agents/skills/skill-chief-of-staff/SKILL.md")
    for text in (
        "explicit supplied plan path",
        "plan already bound by the current execution context",
        "exactly one active plan matching the current repository and worktree",
        "otherwise return `BLOCKED`",
        "discovered `herdr` executable and version",
        "discovered `codex` executable and version",
        "compare against a pinned version only when an applicable plan or",
        "`CODEX_HOME`",
        "required MCP and tool surface",
        "launched process cwd",
        "native Codex lead controller",
        "Template Profile` selects the\nprofile contract",
        "agents/*.toml` owns its profile identity",
        "selected profile, resolved model, and Herdr launch binding",
        "scripts/herdr_main_launcher.py",
        "CoS verifies the full lane contract",
        "launcher verifies runtime projection plus exact pane/cwd identity",
        "Do not construct\nprovider, model, or developer-instruction overrides in CoS",
        "Redact developer instructions and\nrecord their digest instead",
        "discover/list, start, prompt,\nwait, read, and retire/stop",
        "DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT |",
        "PASS | FAIL | BLOCKED",
    ):
        assert text in skill


def test_chief_of_staff_preserves_lifecycle_boundaries() -> None:
    skill = read(".agents/skills/skill-chief-of-staff/SKILL.md")
    for text in (
        "one exact branch and isolated worktree",
        "merge the exact approved PR into its\ndeclared base after gates pass",
        "Project OS\nreview is separate from GitHub review state",
        "Required distinct-identity approval returns\n`BLOCKED`",
        "retire or stop the\nHerdr main-agent session",
        "Never let an agent remove the worktree\nfrom which it is running",
        "Do not require, create, or treat `identity.md`",
        "Herdr owns transient\nprocess observation only",
        "Branch and PR publication may occur after accepted lane proof",
        "Final merge and lane cleanup require whole-plan verification",
    ):
        assert text in skill
    assert "event-driven" not in skill.lower()


def test_chief_of_staff_defines_explicit_turn_attention_audit() -> None:
    skill = read(".agents/skills/skill-chief-of-staff/SKILL.md")
    audit = skill.index("### Attention Audit")
    plan_binding = skill.index("## Plan Binding")
    next_action = skill.index("Select one dependency-ready task")
    assert plan_binding < audit < next_action
    normalized = " ".join(skill.split())
    for text in (
        "On each explicit CoS turn with outstanding CoS-coordinated work",
        "after plan binding and before selecting the next action",
        "currently relevant plan/task, Git/worktree, applicable PR/review, and expected Herdr lane evidence",
        "NO_ACTION | INSPECT | BLOCKED",
        "NO_ACTION` - evidence is consistent with the current lifecycle phase.",
        "INSPECT` - CoS judgment or an approved in-scope correction is needed.",
        "BLOCKED` - an existing canonical blocking condition prevents safe progress.",
        "Consume blocking and verification semantics from their canonical owners",
        "Herdr absence alone is not a blocker",
        "current plan or current-turn evidence establishes that a live bound agent is expected",
        "attention_target",
        "Audit outcomes are advisory attention results, not workflow-state transitions.",
        "does not mutate plan, Git, PR state, Herdr, authority, or durable coordination state",
        "V1 has no autonomous wake mechanism, timer, scheduler, helper-agent dispatch, new profile, hook integration, or persistent heartbeat state.",
        "No polling or subscription mechanism is implied by this skill.",
    ):
        assert text in normalized


def test_chief_of_staff_exposes_attention_and_freshness_output_contract() -> None:
    skill = read(".agents/skills/skill-chief-of-staff/SKILL.md")
    normalized = " ".join(skill.split())
    assert "`attention_result`, optional `attention_target`" in normalized
    assert "runtime evidence freshness (`fresh-this-turn` or `reused-this-session`" in normalized
    assert "Reviewer read-only behavior is instruction-level" in skill
    assert "substantial independent detour, park the current lane" in normalized


def test_chief_of_staff_blocks_delegated_reactivation_and_separates_returns() -> None:
    skill = read(".agents/skills/skill-chief-of-staff/SKILL.md")
    assert "must not activate\nCoS, create peer agents, or reactivate coordination" in skill
    assert "execution returns to `DONE | DONE_WITH_CONCERNS |" in skill
    assert "never converts execution\nstatus into a review verdict" in skill


def test_chief_of_staff_uses_herdr_only_for_agent_dispatch() -> None:
    skill = read(".agents/skills/skill-chief-of-staff/SKILL.md")
    assert "CoS dispatches only an\nindependent Herdr top-level Codex main-agent session." in skill
    for forbidden in (
        "`multi_agent_v1`",
        "native Codex subagents",
        "DeepAgents internal `task` workers",
        "Tura internal workers",
        "executor-local reviewers or helpers",
    ):
        assert forbidden in skill
    assert "Native\nsubagent review remains available only on non-CoS execution paths." in skill


def test_executor_skill_keeps_cos_as_codex_coordination_only() -> None:
    skill = read(".agents/skills/skill-executing-plans/SKILL.md")
    assert "lists `skill-chief-of-staff` in `Required skills`" in skill
    assert "only a Herdr-\nsupervised top-level Codex\nmain agent" in skill
    assert "CoS must not call `multi_agent_v1`, native Codex subagents" in skill
    assert "`dcode-project` for `deepagents`" in skill
    assert "project-delegate` for `tura`" in skill


def test_planning_dispatch_selects_cos_only_for_sustained_codex_coordination() -> None:
    dispatch = read("docs/operating_system/planning/planning-dispatch.md")
    assert "## Coordination Method Selection" in dispatch
    assert "optional coordination specialization of" in dispatch
    assert "lists\n`skill-chief-of-staff` in `Required skills`" in dispatch
    assert "canonical CoS opt-in signal" in dispatch
    assert "sustained handoffs,\nindependent top-level Codex main-agent lanes" in dispatch
    assert "does not add\nan executor, profile, plan field, or durable state artifact" in dispatch
    assert "Herdr is runtime observation and\nmain-agent supervision" in dispatch
    assert "only independent Herdr\ntop-level Codex main-agent sessions" in dispatch
    assert "never calls\n`multi_agent_v1`, native Codex subagents" in dispatch
    assert "`deepagents` and\n`tura` retain their existing peer executor paths" in dispatch
