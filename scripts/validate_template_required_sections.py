"""
@meta
name: validate_template_required_sections
type: script
domain: docs
distribution_tier: starter_kit
responsibility:
  - Validate that templated documents include required sections from template metadata.
  - Enforce non-empty required sections and template-specific frontmatter constraints.
inputs:
  - docs/operating_system/templates/*-template.md
  - Documents matched by template target_globs
outputs:
  - Exit status and human-readable template compliance report.
tags:
  - docs
  - validation
  - planning
  - ci-safe
lifecycle:
  status: active
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any

import yaml

HEADING_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
PLACEHOLDER_ONLY_RE = re.compile(r"^\s*(<[^>\n]+>|\[[^\]\n]+\]|\([^)\n]+\))\s*$")
SECTION_ALIASES: dict[str, tuple[str, ...]] = {
    "Goal and Problem": (
        "Goal and Problem",
        "Goal",
    ),
    "Required Outcomes": (
        "Required Outcomes",
        "Key Deliverables",
    ),
    "Implementation Outcomes": (
        "Implementation Outcomes",
        "Key Deliverables",
    ),
    "Invariants and Edge Cases": (
        "Invariants and Edge Cases",
        "Invariants",
    ),
    "Task Breakdown": (
        "Task Breakdown",
        "Task/Wave Breakdown",
        "Execution Waves",
        "Authoring Waves",
        "Phase Structure",
    ),
}



@dataclass(frozen=True)
class Finding:
    category: str
    path: str
    message: str


@dataclass(frozen=True)
class TemplateRule:
    template_path: Path
    template_id: str
    target_globs: list[str]
    required_sections: list[str]
    required_frontmatter: dict[str, str]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate generated documents against template metadata required sections."
    )
    parser.add_argument(
        "--repo-root",
        default=str(Path(__file__).resolve().parents[1]),
        help="Repository root. Defaults to this script's repository.",
    )
    parser.add_argument(
        "--require-template-selection",
        action="store_true",
        help="Fail when a target document is missing `template_id` frontmatter.",
    )
    return parser


def relative_path(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def _read_text(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if text.startswith("\ufeff"):
        text = text.removeprefix("\ufeff")
    return text


def _extract_frontmatter_and_body(path: Path) -> tuple[dict[str, Any], str]:
    text = _read_text(path)
    if not text.startswith("---"):
        return {}, text
    marker_end = text.find("\n---", 3)
    if marker_end == -1:
        return {}, text
    yaml_blob = text[3:marker_end]
    payload = yaml.safe_load(yaml_blob)
    body = text[marker_end + 4 :]
    if not isinstance(payload, dict):
        return {}, body
    return payload, body


def discover_template_rules(root: Path) -> tuple[list[TemplateRule], list[Finding]]:
    templates_root = root / "docs" / "operating_system" / "templates"
    findings: list[Finding] = []
    rules: list[TemplateRule] = []
    if not templates_root.exists():
        findings.append(
            Finding(
                category="template_metadata_error",
                path="docs/operating_system/templates",
                message="templates directory is missing.",
            )
        )
        return rules, findings

    for path in sorted(templates_root.glob("*-template.md")):
        payload, _ = _extract_frontmatter_and_body(path)
        rel = relative_path(path, root)
        template_id = payload.get("template_id")
        target_globs = payload.get("target_globs")
        required_sections = payload.get("required_sections")
        required_frontmatter = payload.get("required_frontmatter", {})

        if not isinstance(template_id, str) or not template_id.strip():
            findings.append(
                Finding(
                    category="template_metadata_error",
                    path=rel,
                    message="missing required `template_id` frontmatter.",
                )
            )
            continue
        if not (
            isinstance(target_globs, list)
            and target_globs
            and all(isinstance(item, str) and item.strip() for item in target_globs)
        ):
            findings.append(
                Finding(
                    category="template_metadata_error",
                    path=rel,
                    message="`target_globs` must be a non-empty list of strings.",
                )
            )
            continue
        if not (
            isinstance(required_sections, list)
            and required_sections
            and all(isinstance(item, str) and item.strip() for item in required_sections)
        ):
            findings.append(
                Finding(
                    category="template_metadata_error",
                    path=rel,
                    message="`required_sections` must be a non-empty list of strings.",
                )
            )
            continue
        if not (
            isinstance(required_frontmatter, dict)
            and all(
                isinstance(key, str) and key.strip() and isinstance(value, str) and value.strip()
                for key, value in required_frontmatter.items()
            )
        ):
            findings.append(
                Finding(
                    category="template_metadata_error",
                    path=rel,
                    message="`required_frontmatter` must be a mapping of non-empty string keys/values.",
                )
            )
            continue

        rules.append(
            TemplateRule(
                template_path=path,
                template_id=template_id.strip(),
                target_globs=[item.strip() for item in target_globs],
                required_sections=[item.strip() for item in required_sections],
                required_frontmatter={key.strip(): value.strip() for key, value in required_frontmatter.items()},
            )
        )

    return rules, findings


def _extract_h2_sections(body: str) -> dict[str, str]:
    matches = list(HEADING_RE.finditer(body))
    sections: dict[str, str] = {}
    for idx, match in enumerate(matches):
        section_name = match.group(1).strip()
        content_start = match.end()
        content_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(body)
        sections[section_name] = body[content_start:content_end].strip()
    return sections


def _extract_h3_sections(body: str) -> dict[str, str]:
    matches = list(re.finditer(r"^###\s+(.+?)\s*$", body, re.MULTILINE))
    sections: dict[str, str] = {}
    for idx, match in enumerate(matches):
        section_name = match.group(1).strip()
        content_start = match.end()
        content_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(body)
        sections[section_name] = body[content_start:content_end].strip()
    return sections


def _extract_h4_sections(body: str) -> dict[str, str]:
    matches = list(re.finditer(r"^####\s+(.+?)\s*$", body, re.MULTILINE))
    sections: dict[str, str] = {}
    for idx, match in enumerate(matches):
        section_name = match.group(1).strip()
        content_start = match.end()
        content_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(body)
        sections[section_name] = body[content_start:content_end].strip()
    return sections


def _is_section_empty(content: str) -> bool:
    if not content.strip():
        return True
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    if not lines:
        return True
    if all(PLACEHOLDER_ONLY_RE.match(line) for line in lines):
        return True
    return False


def _resolve_section_name(required: str, section_names: set[str]) -> str | None:
    aliases = SECTION_ALIASES.get(required, (required,))
    for candidate in aliases:
        if candidate in section_names:
            return candidate
    return None


def _matches_rule(path: Path, root: Path, rule: TemplateRule) -> bool:
    rel = relative_path(path, root)
    return any(path.match(glob_pattern) or rel == glob_pattern for glob_pattern in rule.target_globs)


def _select_rule(path: Path, frontmatter: dict[str, Any], rules: list[TemplateRule], root: Path) -> TemplateRule | None:
    selected_template_id = frontmatter.get("template_id")
    if not isinstance(selected_template_id, str) or not selected_template_id.strip():
        return None
    selected_template_id = selected_template_id.strip()
    candidates = [rule for rule in rules if _matches_rule(path, root, rule)]
    for rule in candidates:
        if rule.template_id == selected_template_id:
            return rule
    return None


def discover_target_documents(root: Path, rules: list[TemplateRule]) -> list[Path]:
    targets: set[Path] = set()
    for rule in rules:
        for pattern in rule.target_globs:
            targets.update(path for path in root.glob(pattern) if path.is_file())
    return sorted(path for path in targets if path.name != "README.md")


def validate_documents(
    root: Path,
    rules: list[TemplateRule],
    *,
    require_template_selection: bool,
) -> list[Finding]:
    findings: list[Finding] = []
    for path in discover_target_documents(root, rules):
        frontmatter, body = _extract_frontmatter_and_body(path)
        rel = relative_path(path, root)

        selected_template_id = frontmatter.get("template_id")
        if not isinstance(selected_template_id, str) or not selected_template_id.strip():
            if require_template_selection:
                findings.append(
                    Finding(
                        category="template_selection_missing",
                        path=rel,
                        message="target document is missing required `template_id` frontmatter.",
                    )
                )
            continue

        rule = _select_rule(path, frontmatter, rules, root)
        if rule is None:
            findings.append(
                Finding(
                    category="template_selection_invalid",
                    path=rel,
                    message=f"`template_id: {selected_template_id}` is invalid for this document path/type.",
                )
            )
            continue
        sections = _extract_h2_sections(body)
        section_names = set(sections.keys())

        grandfathered_completed_spec = (
            rule.template_id == "detailed-specification"
            and frontmatter.get("status") == "completed"
        )
        for required in (() if grandfathered_completed_spec else rule.required_sections):
            resolved_name = _resolve_section_name(required, section_names)
            if resolved_name is None:
                findings.append(
                    Finding(
                        category="template_section_missing",
                        path=rel,
                        message=f"missing required section `{required}` for template `{rule.template_id}`.",
                    )
                )
                continue
            if _is_section_empty(sections[resolved_name]):
                findings.append(
                    Finding(
                        category="template_section_empty",
                        path=rel,
                        message=f"required section `{resolved_name}` is empty for template `{rule.template_id}`.",
                    )
                )

        for key, expected in rule.required_frontmatter.items():
            actual = frontmatter.get(key)
            if key == "status" and (
                actual in {"completed", "superseded"}
                or (rule.template_id == "implementation-plan" and actual == "active")
            ):
                continue
            if (
                key == "contract_version"
                and rule.template_id == "implementation-plan"
                and actual is None
                and frontmatter.get("status") in {"completed", "superseded"}
            ):
                continue
            if not isinstance(actual, str) or actual.strip() != expected:
                findings.append(
                    Finding(
                        category="template_document_type_mismatch",
                        path=rel,
                        message=(
                            f"document does not match template `{rule.template_id}` requirement: "
                            f"`{key}: {expected}`."
                        ),
                    )
                )

    return findings


def report(findings: list[Finding]) -> int:
    if not findings:
        print("Template required-sections validation passed.")
        return 0
    print("Template required-sections validation failed:")
    for finding in findings:
        print(f"- {finding.category}: {finding.path} - {finding.message}")
    return 1


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = Path(args.repo_root).resolve()
    rules, metadata_findings = discover_template_rules(root)
    findings = [
        *metadata_findings,
        *validate_documents(
            root,
            rules,
            require_template_selection=args.require_template_selection,
        ),
    ]
    return report(findings)


if __name__ == "__main__":
    raise SystemExit(main())
