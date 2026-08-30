"""
@meta
name: validate_learning_materials_format
type: script
domain: docs
distribution_tier: starter_kit
responsibility:
  - Validate learning-material card-body formatting for Obsidian templates.
  - Enforce blank-line separators around SSTART/T-F_Obsidian-v2/Q/A/E/EEND markers.
inputs:
  - .agents/skills/skill-creating-learning-materials/references/question-formats-and-templates.md
  - docs/learning/*.md (optional)
outputs:
  - Exit status and human-readable validation results.
tags:
  - validation
  - learning
  - obsidian
lifecycle:
  status: active
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import re


@dataclass(frozen=True)
class FormatIssue:
    path: Path
    line: int
    message: str


_CARD_START = "SSTART"
_CARD_END = "EEND"
_TEMPLATE_MARKER = "T-F_Obsidian-v2"


def _is_blank(line: str) -> bool:
    return line.strip() == ""


def _is_exact_marker(line: str, marker: str) -> bool:
    return line.strip() == marker


def _validate_line_exists_and_blank(
    *,
    issues: list[FormatIssue],
    path: Path,
    lines: list[str],
    at_index: int,
    expect_blank_at_index: int,
    message: str,
) -> None:
    if expect_blank_at_index < 0 or expect_blank_at_index >= len(lines):
        issues.append(
            FormatIssue(
                path=path,
                line=at_index + 1,
                message=message + " (missing line)",
            )
        )
        return
    if not _is_blank(lines[expect_blank_at_index]):
        issues.append(
            FormatIssue(
                path=path,
                line=expect_blank_at_index + 1,
                message=message,
            )
        )


def validate_card_blocks(*, path: Path, text: str) -> list[FormatIssue]:
    lines = text.splitlines()
    issues: list[FormatIssue] = []

    start_indexes = [i for i, line in enumerate(lines) if _is_exact_marker(line, _CARD_START)]
    for start_index in start_indexes:
        _validate_line_exists_and_blank(
            issues=issues,
            path=path,
            lines=lines,
            at_index=start_index,
            expect_blank_at_index=start_index + 1,
            message="Expected 1 empty line below SSTART",
        )

        end_index = -1
        for i in range(start_index + 1, len(lines)):
            if _is_exact_marker(lines[i], _CARD_END):
                end_index = i
                break
        if end_index < 0:
            issues.append(
                FormatIssue(
                    path=path,
                    line=start_index + 1,
                    message="SSTART without matching EEND",
                )
            )
            continue

        _validate_line_exists_and_blank(
            issues=issues,
            path=path,
            lines=lines,
            at_index=end_index,
            expect_blank_at_index=end_index - 1,
            message="Expected 1 empty line above EEND",
        )

        marker_indexes = [
            i
            for i in range(start_index + 1, end_index)
            if _is_exact_marker(lines[i], _TEMPLATE_MARKER)
        ]
        if not marker_indexes:
            issues.append(
                FormatIssue(
                    path=path,
                    line=start_index + 1,
                    message="Missing T-F_Obsidian-v2 inside card block",
                )
            )
        else:
            marker_index = marker_indexes[0]
            _validate_line_exists_and_blank(
                issues=issues,
                path=path,
                lines=lines,
                at_index=marker_index,
                expect_blank_at_index=marker_index + 1,
                message="Expected 1 empty line below T-F_Obsidian-v2",
            )

        for i in range(start_index + 1, end_index):
            stripped = lines[i].strip()
            if stripped.startswith("A:"):
                if i - 1 >= 0 and not _is_blank(lines[i - 1]):
                    issues.append(
                        FormatIssue(
                            path=path,
                            line=i + 1,
                            message="Expected empty line above A: (separate Q and A)",
                        )
                    )
            if stripped.startswith("E:"):
                if i - 1 >= 0 and not _is_blank(lines[i - 1]):
                    issues.append(
                        FormatIssue(
                            path=path,
                            line=i + 1,
                            message="Expected empty line above E: (separate A and E)",
                        )
                    )

    return issues


def _iter_default_targets(root: Path) -> list[Path]:
    targets: list[Path] = []
    reference = (
        root
        / ".agents"
        / "skills"
        / "skill-creating-learning-materials"
        / "references"
        / "question-formats-and-templates.md"
    )
    if reference.exists():
        targets.append(reference)
    learning_dir = root / "docs" / "learning"
    if learning_dir.exists():
        targets.extend(sorted(learning_dir.glob("**/*.md")))
    return targets


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Validate learning-material card-body formatting for Obsidian templates. "
            "Defaults to validating the skill templates reference and docs/learning if present."
        )
    )
    parser.add_argument(
        "--repo-root",
        default=str(Path(__file__).resolve().parents[1]),
        help="Repository root. Defaults to this script's repository.",
    )
    parser.add_argument(
        "--path",
        action="append",
        default=[],
        help=(
            "File or directory to validate. May be repeated. "
            "If a directory is supplied, all *.md under it are validated."
        ),
    )
    return parser


def _expand_paths(paths: list[Path]) -> list[Path]:
    expanded: list[Path] = []
    for path in paths:
        if path.is_dir():
            expanded.extend(sorted(path.glob("**/*.md")))
        else:
            expanded.append(path)

    unique: list[Path] = []
    seen: set[Path] = set()
    for path in expanded:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(resolved)
    return unique


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    root = Path(args.repo_root).resolve()
    requested = [Path(p) for p in args.path]
    targets = _expand_paths(requested) if requested else _iter_default_targets(root)

    if not targets:
        print("No learning-material targets found to validate.")
        return 0

    all_issues: list[FormatIssue] = []
    for target in targets:
        if not target.exists():
            all_issues.append(FormatIssue(path=target, line=1, message="Path not found"))
            continue
        text = target.read_text(encoding="utf-8")
        all_issues.extend(validate_card_blocks(path=target, text=text))

    if all_issues:
        for issue in all_issues:
            print(f"{issue.path.as_posix()}:{issue.line}: {issue.message}")
        print(f"Learning materials format validation failed ({len(all_issues)} issues).")
        return 1

    print("Learning materials format validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
