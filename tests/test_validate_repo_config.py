"""
@meta
# distribution_tier: starter_kit
type: test
scope: unit
domain: config
covers:
  - Repo config validation for publication config, optional adapter mappings, starter-kit manifest, and runtime configs
excludes:
  - Full publication/export execution
tags:
  - fast
  - ci-safe
"""

from __future__ import annotations

import json
import subprocess
import sys
import uuid
from pathlib import Path
from shutil import rmtree


REPO_ROOT = Path(__file__).resolve().parent.parent
VALIDATOR = REPO_ROOT / "scripts" / "validate_repo_config.py"


def run_validator(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(VALIDATOR), *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def valid_starter_kit_manifest() -> dict[str, object]:
    return {
        "outputRoot": "project-OS-starter-kit",
        "copyPaths": ["AGENTS.md"],
        "requiredPaths": ["repo_config/planning_artifact_schema.yaml"],
        "forbiddenPaths": [".codex"],
    }


def make_test_root() -> Path:
    root = REPO_ROOT / ".tmp-tests" / f"validate-repo-config-{uuid.uuid4().hex}"
    root.mkdir(parents=True, exist_ok=False)
    return root


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _valid_publication_config() -> dict[str, object]:
    return {
        "publicPaths": ["README.md"],
        "forbiddenPaths": [".codex"],
        "requiredPaths": ["README.md"],
        "allowedGeneratedPaths": [],
        "scrubPrivateReferencePaths": ["README.md"],
        "forbiddenMetadataMarkers": ["repo: private"],
    }


def test_validator_passes_for_current_repo() -> None:
    result = run_validator()

    assert result.returncode == 0
    assert "repo config validation passed" in result.stdout.lower()


def test_validator_fails_when_publication_config_is_missing_required_keys() -> None:
    test_root = make_test_root()
    try:
        publication_config = test_root / "repo_config" / "publication-config.json"
        starter_kit_manifest = test_root / "repo_config" / "starter-kit-manifest.json"

        write_json(publication_config, {"publicPaths": ["README.md"]})
        write_json(starter_kit_manifest, valid_starter_kit_manifest())

        result = run_validator(
            "--publication-config",
            str(publication_config),
            "--starter-kit-manifest",
            str(starter_kit_manifest),
        )

        assert result.returncode == 1
        assert "forbiddenpaths" in result.stdout.lower()
    finally:
        rmtree(test_root, ignore_errors=True)




def test_validator_allows_missing_starter_kit_manifest_file() -> None:
    test_root = make_test_root()
    try:
        publication_config = test_root / "repo_config" / "publication-config.json"

        write_json(publication_config, _valid_publication_config())
        write_text(test_root / "README.md", "# readme\n")

        result = run_validator(
            "--publication-config",
            str(publication_config),
            "--starter-kit-manifest",
            str(test_root / "repo_config" / "starter-kit-manifest.json"),
        )

        assert result.returncode == 0
        assert "repo config validation passed" in result.stdout.lower()
    finally:
        rmtree(test_root, ignore_errors=True)


def test_deepagents_runtime_state_is_ignored() -> None:
    ignored = subprocess.run(
        ["git", "check-ignore", "-q", ".deepagents/config.toml"],
        cwd=REPO_ROOT,
        check=False,
    )
    assert ignored.returncode == 0
    assert subprocess.run(
        ["git", "check-ignore", "--no-index", "-q", ".deepagents/agents/generated/AGENTS.md"],
        cwd=REPO_ROOT,
        check=False,
    ).returncode == 0
