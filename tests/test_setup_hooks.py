"""
@meta
name: test_setup_hooks
type: test
scope: unit
domain: docs
distribution_tier: starter_kit
covers:
  - Local hook setup scripts install the canonical repo-contract validator entrypoint.
tags:
  - fast
  - ci-safe
lifecycle:
  status: active
"""

from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
HOOK_SCRIPT_PATHS = [
    REPO_ROOT / "scripts" / "setup_hooks.ps1",
    REPO_ROOT / "scripts" / "setup_hooks.sh",
]


def test_hook_setup_scripts_install_repo_contract_validator_entrypoint() -> None:
    for script_path in HOOK_SCRIPT_PATHS:
        script_text = script_path.read_text(encoding="utf-8")

        assert "validate_repo_contracts.py --fast" in script_text
        assert ".venv" in script_text
