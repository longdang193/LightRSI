"""
@meta
# distribution_tier: starter_kit
name: test_validate_template_required_sections
type: test
scope: unit
domain: docs
covers:
  - Template metadata parsing for required-section validation
  - Required section presence and non-empty checks
  - Template/document-type matching using required frontmatter constraints
tags:
  - fast
  - ci-safe
lifecycle:
  status: active
"""

from __future__ import annotations

import importlib.util
import sys
import uuid
from pathlib import Path
from shutil import rmtree

REPO_ROOT = Path(__file__).resolve().parent.parent
VALIDATOR_PATH = REPO_ROOT / "scripts" / "validate_template_required_sections.py"
SCHEMA_HELPER_PATH = REPO_ROOT / "scripts" / "planning_artifact_schema.py"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


VALIDATOR = load_module("validate_template_required_sections", VALIDATOR_PATH)
SCHEMA = load_module("planning_artifact_schema_for_template_tests", SCHEMA_HELPER_PATH)


def make_test_root() -> Path:
    root = REPO_ROOT / ".tmp-tests" / f"validate-template-required-sections-{uuid.uuid4().hex}"
    root.mkdir(parents=True, exist_ok=False)
    return root


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def seed_template(root: Path) -> None:
    write_text(
        root / "docs" / "operating_system" / "templates" / "implementation-plan-template.md",
        """---
template_id: implementation-plan
target_globs:
  - docs/superpowers/plans/*.md
required_sections:
  - Goal
  - Implementation Outcomes
  - Task Breakdown
  - Verification
required_frontmatter:
  artifact_type: plan
---

# Implementation Plan Template
""",
    )


def seed_spec_template(root: Path) -> None:
    write_text(
        root / "docs" / "operating_system" / "templates" / "detailed-specification-template.md",
        """---
template_id: detailed-specification
target_globs:
  - docs/superpowers/specs/*.md
required_sections:
  - Goal and Problem
  - Required Outcomes
  - Design Analysis
  - Design Decisions
  - Invariants and Edge Cases
  - Validation Plan
  - Completion Criteria
required_frontmatter:
  artifact_type: spec
---

# Detailed Specification Template
""",
    )


def seed_draft_spec_template(root: Path) -> None:
    write_text(
        root / "docs" / "operating_system" / "templates" / "draft-specification-template.md",
        """---
template_id: draft-specification
target_globs:
  - docs/superpowers/specs/*.md
required_sections:
  - Goal and Scope
  - User Flow and Business Rules
  - UI Intent and Known States
  - Assumptions and Open Questions
  - Prototype and Validation Findings
  - Promotion Readiness
required_frontmatter:
  artifact_type: spec
  status: proposed
---

# Draft Specification Template
""",
    )

def seed_audit_template(root: Path) -> None:
    write_text(
        root / "docs" / "operating_system" / "templates" / "audit-report-with-evidence-template.md",
        """---
template_id: audit-report-with-evidence
target_globs:
  - docs/superpowers/plans/audit/*/report.md
required_sections:
  - Current situation
  - Evidence and reproduction
---

# Audit Template
""",
    )

def seed_brainstorming_template(root: Path) -> None:
    write_text(
        root / "docs" / "operating_system" / "templates" / "brainstorming-detailed-report-template.md",
        """---
template_id: brainstorming-detailed-report
target_globs:
  - docs/superpowers/plans/brainstorming/*/report.md
required_sections:
  - Current situation
  - Options analysis
---

# Brainstorming Template
""",
    )

def test_missing_required_section_fails() -> None:
    root = make_test_root()
    try:
        seed_template(root)
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            """---
artifact_type: plan
template_id: implementation-plan
---

# Demo Plan

## Goal
Ship safely.

## Key Deliverables
- deliverable one

## Verification
- pytest -q
""",
        )
        rules, findings = VALIDATOR.discover_template_rules(root)
        assert findings == []
        issues = VALIDATOR.validate_documents(root, rules, require_template_selection=False)
        assert any(issue.category == "template_section_missing" for issue in issues)
    finally:
        rmtree(root, ignore_errors=True)


def test_empty_goal_and_legacy_outcomes_fail() -> None:
    root = make_test_root()
    try:
        seed_template(root)
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            """---
artifact_type: plan
template_id: implementation-plan
---

# Demo Plan

## Goal
<what this plan must deliver>

## Key Deliverables

## Task/Wave Breakdown
- task 1

## Verification
- pytest -q
""",
        )
        rules, _ = VALIDATOR.discover_template_rules(root)
        issues = VALIDATOR.validate_documents(root, rules, require_template_selection=False)
        categories = {issue.category for issue in issues}
        assert "template_section_empty" in categories
    finally:
        rmtree(root, ignore_errors=True)


def test_required_frontmatter_mismatch_fails() -> None:
    root = make_test_root()
    try:
        seed_template(root)
        write_text(
            root / "docs" / "superpowers" / "plans" / "demo-plan.md",
            """---
artifact_type: spec
template_id: implementation-plan
---

# Demo Plan

## Goal
Ship safely.

## Key Deliverables
- deliverable one

## Task/Wave Breakdown
- task 1

## Verification
- pytest -q
""",
        )
        rules, _ = VALIDATOR.discover_template_rules(root)
        issues = VALIDATOR.validate_documents(root, rules, require_template_selection=False)
        assert any(issue.category == "template_document_type_mismatch" for issue in issues)
    finally:
        rmtree(root, ignore_errors=True)


def test_active_implementation_plan_matches_lifecycle_status() -> None:
    root = make_test_root()
    try:
        seed_template(root)
        write_text(
            root / "docs" / "superpowers" / "plans" / "active-plan.md",
            """---
artifact_type: plan
template_id: implementation-plan
status: active
---

# Active Plan

## Goal
Ship safely.

## Implementation Outcomes
- deliverable one

## Task Breakdown
- task 1

## Verification
- pytest -q
""",
        )
        rules, findings = VALIDATOR.discover_template_rules(root)
        assert findings == []
        assert VALIDATOR.validate_documents(root, rules, require_template_selection=False) == []
    finally:
        rmtree(root, ignore_errors=True)

def test_nested_audit_report_is_discovered_from_template_glob() -> None:
    root = make_test_root()
    try:
        seed_audit_template(root)
        write_text(
            root / "docs" / "superpowers" / "plans" / "audit" / "demo" / "report.md",
            """---
template_id: audit-report-with-evidence
---

# Audit

## Current situation
Failure reproduced.
""",
        )
        rules, findings = VALIDATOR.discover_template_rules(root)
        assert findings == []
        issues = VALIDATOR.validate_documents(root, rules, require_template_selection=False)
        assert any(issue.category == "template_section_missing" for issue in issues)
    finally:
        rmtree(root, ignore_errors=True)

def test_nested_brainstorming_report_is_discovered_from_template_glob() -> None:
    root = make_test_root()
    try:
        seed_brainstorming_template(root)
        write_text(
            root / "docs" / "superpowers" / "plans" / "brainstorming" / "demo" / "report.md",
            """---
template_id: brainstorming-detailed-report
---

# Brainstorming

## Current situation
Direction remains unclear.
""",
        )
        rules, findings = VALIDATOR.discover_template_rules(root)
        assert findings == []
        issues = VALIDATOR.validate_documents(root, rules, require_template_selection=False)
        assert any(issue.category == "template_section_missing" for issue in issues)
    finally:
        rmtree(root, ignore_errors=True)

def test_plan_accepts_current_and_legacy_section_names() -> None:
    root = make_test_root()
    try:
        seed_template(root)
        write_text(
            root / "docs" / "superpowers" / "plans" / "current-plan.md",
            """---
artifact_type: plan
template_id: implementation-plan
---

# Current Plan

## Goal
Ship safely.

## Implementation Outcomes
- working behavior

## Task Breakdown
- bounded task

## Verification
- pytest -q
""",
        )
        write_text(
            root / "docs" / "superpowers" / "plans" / "legacy-plan.md",
            """---
artifact_type: plan
template_id: implementation-plan
---

# Legacy Plan

## Goal
Ship safely.

## Key Deliverables
- working behavior

## Task/Wave Breakdown
- bounded task

## Verification
- pytest -q
""",
        )
        rules, _ = VALIDATOR.discover_template_rules(root)
        issues = VALIDATOR.validate_documents(root, rules, require_template_selection=False)
        assert issues == []
    finally:
        rmtree(root, ignore_errors=True)


def test_spec_requires_design_analysis_not_task_breakdown() -> None:
    root = make_test_root()
    try:
        seed_spec_template(root)
        write_text(
            root / "docs" / "superpowers" / "specs" / "demo-spec.md",
            """---
artifact_type: spec
template_id: detailed-specification
---

# Demo Spec

## Goal and Problem
Define current problem and desired behavior.

## Required Outcomes
- approved contract

## Design Analysis
Current evidence, scope, requirements, and options.

## Design Decisions
Use one owner.

## Invariants and Edge Cases
No duplicate truth; minimal and failure cases remain correct.

## Validation Plan
- inspect contract

## Completion Criteria
- contract approved
""",
        )
        rules, findings = VALIDATOR.discover_template_rules(root)
        assert findings == []
        assert VALIDATOR.validate_documents(root, rules, require_template_selection=False) == []
    finally:
        rmtree(root, ignore_errors=True)


def test_same_spec_path_selects_draft_then_detailed_template() -> None:
    root = make_test_root()
    try:
        seed_draft_spec_template(root)
        seed_spec_template(root)
        path = root / "docs" / "superpowers" / "specs" / "demo-spec.md"
        write_text(
            path,
            """---
artifact_type: spec
template_id: draft-specification
status: proposed
---

# Demo Draft

## Goal and Scope
Validate behavior.

## User Flow and Business Rules
User triggers one operation.

## UI Intent and Known States
Loading, success, and error are known.

## Assumptions and Open Questions
One assumption remains.

## Prototype and Validation Findings
Prototype confirms expected flow.

## Promotion Readiness
User approval remains.
""",
        )
        rules, findings = VALIDATOR.discover_template_rules(root)
        assert findings == []
        assert VALIDATOR.validate_documents(root, rules, require_template_selection=False) == []

        write_text(
            path,
            """---
artifact_type: spec
template_id: detailed-specification
status: active
---

# Demo Spec

## Goal and Problem
Define approved behavior.

## Required Outcomes
- approved contract

## Design Analysis
Validated evidence and scope.

## Design Decisions
Use one owner.

## Invariants and Edge Cases
No duplicate truth.

## Validation Plan
- inspect contract

## Completion Criteria
- contract approved
""",
        )
        assert VALIDATOR.validate_documents(root, rules, require_template_selection=False) == []
    finally:
        rmtree(root, ignore_errors=True)


def test_spec_accepts_legacy_section_aliases() -> None:
    root = make_test_root()
    try:
        seed_spec_template(root)
        write_text(
            root / "docs" / "superpowers" / "specs" / "legacy-spec.md",
            """---
artifact_type: spec
template_id: detailed-specification
status: proposed
---

# Legacy Spec

## Goal
Define behavior.

## Key Deliverables
- approved contract

## Design Analysis
Current evidence and options.

## Design Decisions
Use one owner.

## Invariants
No duplicate truth.

## Validation Plan
- inspect contract

## Completion Criteria
- contract approved
""",
        )
        rules, findings = VALIDATOR.discover_template_rules(root)
        assert findings == []
        assert VALIDATOR.validate_documents(root, rules, require_template_selection=False) == []
    finally:
        rmtree(root, ignore_errors=True)

def test_completed_spec_grandfathers_old_required_sections() -> None:
    root = make_test_root()
    try:
        seed_spec_template(root)
        write_text(
            root / "docs" / "superpowers" / "specs" / "completed-spec.md",
            """---
artifact_type: spec
template_id: detailed-specification
status: completed
---

# Completed Spec

## Goal
Historical behavior.
""",
        )
        rules, findings = VALIDATOR.discover_template_rules(root)
        assert findings == []
        assert VALIDATOR.validate_documents(root, rules, require_template_selection=False) == []
    finally:
        rmtree(root, ignore_errors=True)


def test_completed_plan_accepts_template_initial_status() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "operating_system" / "templates" / "implementation-plan-template.md",
            """---
template_id: implementation-plan
target_globs:
  - docs/superpowers/plans/*.md
required_sections:
  - Goal
required_frontmatter:
  artifact_type: plan
  status: proposed
---
""",
        )
        write_text(
            root / "docs" / "superpowers" / "plans" / "completed-plan.md",
            """---
artifact_type: plan
template_id: implementation-plan
status: completed
---

# Completed Plan

## Goal
Verified work.
""",
        )
        rules, findings = VALIDATOR.discover_template_rules(root)
        assert findings == []
        assert VALIDATOR.validate_documents(root, rules, require_template_selection=False) == []
    finally:
        rmtree(root, ignore_errors=True)


def test_superseded_plan_accepts_template_initial_status() -> None:
    root = make_test_root()
    try:
        write_text(
            root / "docs" / "operating_system" / "templates" / "implementation-plan-template.md",
            """---
template_id: implementation-plan
target_globs:
  - docs/superpowers/plans/*.md
required_sections:
  - Goal
required_frontmatter:
  artifact_type: plan
  status: proposed
---
""",
        )
        write_text(
            root / "docs" / "superpowers" / "plans" / "superseded-plan.md",
            """---
artifact_type: plan
template_id: implementation-plan
status: superseded
---

# Superseded Plan

## Goal
Replaced by current plan.
""",
        )
        rules, findings = VALIDATOR.discover_template_rules(root)
        assert findings == []
        assert VALIDATOR.validate_documents(root, rules, require_template_selection=False) == []
    finally:
        rmtree(root, ignore_errors=True)


def test_shipped_planning_templates_cover_schema_required_frontmatter() -> None:
    templates = {
        "plan": REPO_ROOT / "docs" / "operating_system" / "templates" / "implementation-plan-template.md",
        "spec": REPO_ROOT / "docs" / "operating_system" / "templates" / "detailed-specification-template.md",
    }

    for artifact_type, template_path in templates.items():
        frontmatter, _ = VALIDATOR._extract_frontmatter_and_body(template_path)
        required_frontmatter = frontmatter["required_frontmatter"]
        required_fields = SCHEMA.get_required_fields(REPO_ROOT, artifact_type)
        required_values = SCHEMA.get_required_values(REPO_ROOT, artifact_type)

        assert set(required_fields) <= set(required_frontmatter)
        assert all(required_frontmatter[key] == value for key, value in required_values.items())
        for field in ("status", "layer"):
            assert required_frontmatter[field] in SCHEMA.get_allowed_values(REPO_ROOT, field, artifact_type)


def test_implementation_plan_template_documents_executor_and_coordination() -> None:
    template = (
        REPO_ROOT / "docs" / "operating_system" / "templates" / "implementation-plan-template.md"
    ).read_text(encoding="utf-8")

    assert "Default task executor: `codex | deepagents | tura`" in template
    assert "Task ledger `Executor` values are `codex`, `deepagents`, or `tura`" in template
    assert "Coordination: `git-tracked | none`" in template
    assert "Required when `Execution Approach > Coordination` is `git-tracked`" in template
    assert "current DeepAgents launcher uses no MCP" in template
    assert "## Coordination State" in template
    assert "Allowed states: `pending`, `active`, `blocked`, `completed`." in template
    assert "`high` executor therefore uses `xhigh` validator" not in template
    assert "Do not pair `xhigh` executor" not in template
    assert "<none | discovered profile>" in template
