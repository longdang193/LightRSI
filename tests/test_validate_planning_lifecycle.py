"""
@meta
# distribution_tier: starter_kit
name: test_validate_planning_lifecycle
type: test
scope: unit
domain: docs
covers:
  - Optional planning-artifact validation
  - Existing specification and plan metadata validation
  - Optional plan-to-spec reference validation
tags:
  - fast
  - ci-safe
lifecycle:
  status: active
"""

from __future__ import annotations

from pathlib import Path
from shutil import copy2, rmtree
import subprocess
import sys
import uuid

REPO_ROOT = Path(__file__).resolve().parent.parent
VALIDATOR = REPO_ROOT / "scripts" / "validate_planning_lifecycle.py"


def make_test_root() -> Path:
    root = REPO_ROOT / ".tmp-tests" / f"validate-planning-{uuid.uuid4().hex}"
    (root / "repo_config").mkdir(parents=True, exist_ok=False)
    copy2(
        REPO_ROOT / "repo_config" / "planning_artifact_schema.yaml",
        root / "repo_config" / "planning_artifact_schema.yaml",
    )
    return root


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def run_validator(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(VALIDATOR), "--repo-root", str(root), *args],
        capture_output=True,
        text=True,
        check=False,
    )


def git_tracked_plan(
    *,
    status: str = "active",
    mode: str = "subagent-ready",
    ledger: str,
    coordination_schema: int | None = None,
    contract_version: str | None = "1",
) -> str:
    schema_line = f"- Coordination schema: `{coordination_schema}`\n" if coordination_schema is not None else ""
    contract_line = f'contract_version: "{contract_version}"\n' if contract_version is not None else ""
    return f"""---
artifact_type: plan
template_id: implementation-plan
{contract_line}status: {status}
layer: change
parent_spec: none
---
# Plan

## Execution Approach

- Mode: `{mode}`
- Coordination: `git-tracked`

## Coordination State

- Coordination owner: `lead-controller`
{schema_line}- Branch: `main`
- Base commit: `abc123`
- Active task(s): `Task 1`
- Expected workspace: `current`
- Next action: `Complete Task 1`
- Blockers: `none`

## Task Breakdown

### Task 1: Example

**Template Profile:**
- Controller-selected: `none (lead controller)`

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
{ledger}
"""


def modern_plan(*, status: str = "active", execution: str, task_body: str = "") -> str:
    return f"""---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: {status}
layer: change
parent_spec: none
---
# Plan

## Execution Approach

{execution}

## Task Breakdown

### Task 1: Example

{task_body}
"""


def test_empty_repo_does_not_require_planning_artifacts() -> None:
    root = make_test_root()
    try:
        result = run_validator(root)
        assert result.returncode == 0
        assert "passed" in result.stdout.lower()
    finally:
        rmtree(root, ignore_errors=True)


def test_plan_parent_spec_must_resolve() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            "---\nartifact_type: plan\ncontract_version: \"1\"\nstatus: proposed\nlayer: change\nparent_spec: docs/superpowers/specs/missing.md\n---\n# Plan\n",
        )
        result = run_validator(root)
        assert result.returncode == 1
        assert "parent_spec does not resolve" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_existing_spec_and_linked_plan_pass() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "specs" / "demo-spec.md",
            "---\nartifact_type: spec\ntemplate_id: detailed-specification\nstatus: active\nlayer: change\n---\n# Spec\n",
        )
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            "---\nartifact_type: plan\ntemplate_id: implementation-plan\ncontract_version: \"1\"\nstatus: proposed\nlayer: change\nparent_spec: docs/superpowers/specs/demo-spec.md\n---\n# Plan\n\n## Execution Approach\n\n- Mode: `inline sequential`\n- Coordination: `none`\n\n## Task Breakdown\n\n### Task 1: Example\n\n**Template Profile:**\n- Controller-selected: `none (lead controller)`\n",
        )
        result = run_validator(root)
        assert result.returncode == 0
    finally:
        rmtree(root, ignore_errors=True)


def test_current_plan_requires_execution_approach() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            "---\nartifact_type: plan\ntemplate_id: implementation-plan\ncontract_version: \"1\"\nstatus: active\nlayer: change\nparent_spec: none\n---\n# Plan\n",
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "requires `## Execution Approach`" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_historical_completed_plan_without_modern_fields_passes() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "historical.md",
            "---\nartifact_type: plan\ntemplate_id: implementation-plan\nstatus: completed\nlayer: change\nparent_spec: none\n---\n# Historical plan\n",
        )

        result = run_validator(root)

        assert result.returncode == 0
    finally:
        rmtree(root, ignore_errors=True)


def test_modern_completed_uncoordinated_plan_is_validated() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            modern_plan(
                status="completed",
                execution="- Mode: `inline sequential`\n- Coordination: `none`",
            ).replace("### Task 1: Example", "### Work item"),
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "requires at least one `### Task N` section" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_current_plan_requires_contract_version() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            "---\nartifact_type: plan\ntemplate_id: implementation-plan\nstatus: active\nlayer: change\nparent_spec: none\n---\n# Plan\n",
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "requires `contract_version: 1`" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_current_plan_rejects_unknown_coordination_without_skipping_checks() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            modern_plan(
                execution="- Mode: `subagent-ready`\n- Coordination: `git-trackedd`",
                task_body="**Template Profile:**\n- Controller-selected: `none (lead controller)`",
            ),
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "Coordination must be one of: git-tracked, none" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_task_profile_names_require_valid_registry_records() -> None:
    root = make_test_root()
    try:
        write_text(root / "agents" / "ui.toml", 'name = "broken"\n')
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            modern_plan(
                execution="- Mode: `subagent-ready`\n- Coordination: `none`",
                task_body="**Template Profile:**\n- Controller-selected: `ui`",
            ),
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "Agent profile" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)

def test_task_profiles_are_validated_inside_task_section() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            modern_plan(
                execution="- Mode: `subagent-ready`\n- Coordination: `none`",
                task_body="**Template Profile:**\n- Controller-selected: `obsolete`",
            ),
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "Template Profile must be one of" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_modern_fields_in_historical_plan_are_validated_when_present() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "historical.md",
            modern_plan(
                status="superseded",
                execution="- Mode: `obsolete`\n- Coordination: `none`",
                task_body="**Template Profile:**\n- Controller-selected: `none (lead controller)`",
            ),
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "Mode must be one of" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_readme_pointers_are_not_planning_artifacts() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "specs" / "README.md",
            "Archived specifications.\n",
        )
        write_text(
            root / "docs" / "superpowers" / "plans" / "README.md",
            "Archived plans.\n",
        )

        result = run_validator(root)

        assert result.returncode == 0
        assert "passed" in result.stdout.lower()
    finally:
        rmtree(root, ignore_errors=True)


def test_git_tracked_plan_requires_coordination_state_and_ledger() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            """---
artifact_type: plan
status: active
layer: change
parent_spec: none
---
# Plan

## Execution Approach

- Mode: `subagent-ready`
- Coordination: `git-tracked`
""",
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "requires `## Coordination State`" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_sequential_git_tracked_plan_rejects_multiple_active_tasks() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            git_tracked_plan(
                ledger="\n".join(
                    (
                        "| Task 1 | `active` | current | codex | none | `test-one` | pending |",
                        "| Task 2 | `active` | current | codex | none | `test-two` | pending |",
                    )
                )
            ),
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "permits at most one active task" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_active_task_requires_completed_dependencies() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            git_tracked_plan(
                ledger="\n".join(
                    (
                        "| Task 1 | `pending` | current | codex | none | `test-one` | pending |",
                        "| Task 2 | `active` | current | codex | Task 1 | `test-two` | pending |",
                    )
                )
            ).replace("- Active task(s): `Task 1`", "- Active task(s): `Task 2`"),
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "depends on non-completed task `Task 1`" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_completed_task_requires_recorded_evidence() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            git_tracked_plan(
                ledger="| Task 1 | `completed` | current | codex | none | `test-one` | pending |"
            ).replace("- Active task(s): `Task 1`", "- Active task(s): `none`"),
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "completed task `Task 1` requires recorded evidence" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_task_executor_must_use_canonical_value() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            git_tracked_plan(
                ledger="| Task 1 | `active` | current | obsolete | none | `test-one` | pending |"
            ),
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "task `Task 1` executor must be one of: codex, deepagents, tura" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_historical_completed_plan_preserves_legacy_coordination() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            git_tracked_plan(
                status="completed",
                contract_version=None,
                ledger="| Task 1 | `pending` | current | codex | none | `test-one` | pending |"
            )
            .replace("- Active task(s): `Task 1`", "- Active task(s): `Task 1`")
            .replace("- Next action: `Complete Task 1`", "- Next action: `Task 1 is next`")
            .replace("- Blockers: `none`", "- Blockers: `none`")
        )

        result = run_validator(root)

        assert result.returncode == 0
        assert "passed" in result.stdout.lower()
    finally:
        rmtree(root, ignore_errors=True)


def test_completed_plan_with_terminal_coordination_passes() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            git_tracked_plan(
                status="completed",
                coordination_schema=1,
                ledger="| Task 1 | `completed` | current | codex | none | `test-one` | recorded proof |"
            )
            .replace("- Active task(s): `Task 1`", "- Active task(s): `none`")
            .replace("- Next action: `Complete Task 1`", "- Next action: `none`")
        )

        result = run_validator(root)

        assert result.returncode == 0
    finally:
        rmtree(root, ignore_errors=True)


def test_modern_completed_plan_requires_terminal_coordination() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            git_tracked_plan(
                status="completed",
                coordination_schema=1,
                ledger="| Task 1 | `pending` | current | codex | none | `test-one` | pending |",
            ),
        )

        result = run_validator(root)

        assert result.returncode == 1
        assert "completed plan requires every task to be completed" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_completed_task_rejects_unchecked_task_checklist() -> None:
    root = make_test_root()
    try:
        plan = git_tracked_plan(
            coordination_schema=2,
            ledger="| Task 1 | `completed` | current | codex | none | `test-one` | recorded proof |"
        ).replace("- Active task(s): `Task 1`", "- Active task(s): `none`")
        plan = plan.replace(
            "### Task 1: Example\n\n**Template Profile:**",
            "### Task 1: Example\n\n**Steps:**\n- [ ] Step 1: unfinished\n\n**Template Profile:**",
        )
        write_text(root / "docs" / "superpowers" / "plans" / "demo-plan.md", plan)

        result = run_validator(root)

        assert result.returncode == 1
        assert "completed task `Task 1` has unchecked checklist items" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_completed_plan_rejects_unchecked_verification_checklist() -> None:
    root = make_test_root()
    try:
        plan = git_tracked_plan(
            status="completed",
            coordination_schema=2,
            ledger="| Task 1 | `completed` | current | codex | none | `test-one` | recorded proof |",
        ).replace("- Active task(s): `Task 1`", "- Active task(s): `none`")
        plan = plan.replace(
            "| Task 1 | `completed` | current | codex | none | `test-one` | recorded proof |",
            "| Task 1 | `completed` | current | codex | none | `test-one` | recorded proof |\n\n## Verification\n\n- [ ] `test-one`",
        )
        write_text(root / "docs" / "superpowers" / "plans" / "demo-plan.md", plan)

        result = run_validator(root)

        assert result.returncode == 1
        assert "completed plan requires all verification checklist items checked" in result.stdout
    finally:
        rmtree(root, ignore_errors=True)


def test_modern_completed_plan_allows_post_verification_next_action() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            git_tracked_plan(
                status="completed",
                coordination_schema=1,
                ledger="| Task 1 | `completed` | current | codex | none | `test-one` | recorded proof |",
            )
            .replace("- Active task(s): `Task 1`", "- Active task(s): `none`")
            .replace("- Next action: `Complete Task 1`", "- Next action: `await authorized branch disposition`")
        )

        result = run_validator(root)

        assert result.returncode == 0
    finally:
        rmtree(root, ignore_errors=True)
