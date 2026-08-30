"""
@meta
name: validate_env_gitignore_contract
type: script
domain: security
distribution_tier: starter_kit
responsibility:
  - Validate .gitignore contains mandatory environment ignore entries.
  - Require `!.env.example` when `.env.example` exists in repository root.
inputs:
  - .gitignore
  - .env.example (optional)
outputs:
  - Exit status and contract validation result.
tags:
  - validation
  - security
  - ci-safe
lifecycle:
  status: active
"""

from __future__ import annotations

import argparse
from pathlib import Path


REQUIRED_ENTRIES = (".env", ".env.*", "*.private.*", "*.local.*")
EXAMPLE_ALLOWLIST_ENTRY = "!.env.example"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate .gitignore env-file safety contract.",
    )
    parser.add_argument(
        "--repo-root",
        default=str(Path(__file__).resolve().parents[1]),
        help="Repository root path.",
    )
    return parser


def _normalized_non_comment_lines(text: str) -> set[str]:
    lines: set[str] = set()
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        lines.add(line)
    return lines


def validate_env_gitignore_contract(root: Path) -> list[str]:
    issues: list[str] = []
    gitignore_path = root / ".gitignore"
    if not gitignore_path.exists():
        return ["missing .gitignore at repository root"]

    entries = _normalized_non_comment_lines(gitignore_path.read_text(encoding="utf-8"))

    for required in REQUIRED_ENTRIES:
        if required not in entries:
            issues.append(f"missing required .gitignore entry: {required}")

    env_example_path = root / ".env.example"
    if env_example_path.exists() and EXAMPLE_ALLOWLIST_ENTRY not in entries:
        issues.append(
            "missing required .gitignore entry when .env.example exists: "
            f"{EXAMPLE_ALLOWLIST_ENTRY}"
        )

    return issues


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = Path(args.repo_root).resolve()

    issues = validate_env_gitignore_contract(root)
    if issues:
        print("Env gitignore contract validation failed:")
        for issue in issues:
            print(f"- {issue}")
        return 1

    print("Env gitignore contract validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
