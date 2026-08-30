"""
@meta
name: validate_repo_config
type: script
domain: config
distribution_tier: starter_kit
responsibility:
  - Validate repo-level config ownership surfaces for shape and path sanity.
inputs:
  - repo_config/publication-config.json
  - repo_config/starter-kit-manifest.json (optional; validated when present)
outputs:
  - Exit status and human-readable validation results.
tags:
  - config
  - validation
  - ci-safe
lifecycle:
  status: active
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import yaml


REQUIRED_PUBLICATION_KEYS = {
    "publicPaths",
    "forbiddenPaths",
    "requiredPaths",
    "allowedGeneratedPaths",
    "scrubPrivateReferencePaths",
    "forbiddenMetadataMarkers",
}
OPTIONAL_PUBLICATION_LIST_KEYS = {
    "forbiddenFilenameMarkers",
    "publicExcludeGlobs",
}
OPTIONAL_PUBLICATION_BOOL_KEYS = {
    "publicIncludeOverridesExcludes",
}
REQUIRED_STARTER_KIT_KEYS = {
    "outputRoot",
    "copyPaths",
    "requiredPaths",
    "forbiddenPaths",
}

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Validate repo config ownership surfaces, publication boundaries, "
            "starter-kit manifest and runtime config YAML shape."
        )
    )
    parser.add_argument(
        "--publication-config",
        default="repo_config/publication-config.json",
        help="Path to publication-config.json.",
    )
    parser.add_argument(
        "--starter-kit-manifest",
        default="repo_config/starter-kit-manifest.json",
        help=(
            "Path to starter-kit-manifest.json. Optional in consumer repos; "
            "validated when present."
        ),
    )
    parser.add_argument(
        "--repo-root",
        default=None,
        help="Optional repo root override. Defaults to the current working directory.",
    )
    return parser


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_yaml(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def infer_repo_root(
    repo_root_arg: str | None,
    publication_config: Path,
    starter_kit_manifest: Path,
) -> Path:
    if repo_root_arg:
        return Path(repo_root_arg).resolve()

    for candidate in (publication_config, starter_kit_manifest):
        parts = candidate.resolve().parts
        if len(parts) >= 2 and parts[-2] == "repo_config":
            return candidate.resolve().parent.parent

    return Path.cwd().resolve()


def validate_publication_config(payload: Any, errors: list[str]) -> None:
    if not isinstance(payload, dict):
        errors.append("Publication config must be a JSON object.")
        return

    missing = REQUIRED_PUBLICATION_KEYS - set(payload.keys())
    if missing:
        errors.append(
            "Publication config is missing required keys: "
            + ", ".join(sorted(missing))
        )

    for key in REQUIRED_PUBLICATION_KEYS & set(payload.keys()):
        value = payload[key]
        if not isinstance(value, list) or not all(
            isinstance(item, str) and item.strip() for item in value
        ):
            errors.append(f"Publication config key `{key}` must be a list of strings.")

    for key in OPTIONAL_PUBLICATION_LIST_KEYS & set(payload.keys()):
        value = payload[key]
        if not isinstance(value, list) or not all(
            isinstance(item, str) and item.strip() for item in value
        ):
            errors.append(f"Publication config key `{key}` must be a list of strings.")

    for key in OPTIONAL_PUBLICATION_BOOL_KEYS & set(payload.keys()):
        if not isinstance(payload[key], bool):
            errors.append(f"Publication config key `{key}` must be a boolean.")


def validate_starter_kit_manifest(payload: Any, errors: list[str]) -> None:
    if not isinstance(payload, dict):
        errors.append("Starter-kit manifest must be a JSON object.")
        return

    missing = REQUIRED_STARTER_KIT_KEYS - set(payload.keys())
    if missing:
        errors.append(
            "Starter-kit manifest is missing required keys: "
            + ", ".join(sorted(missing))
        )

    output_root = payload.get("outputRoot")
    if not isinstance(output_root, str) or not output_root.strip():
        errors.append("Starter-kit manifest key `outputRoot` must be a non-empty string.")

    for key in (REQUIRED_STARTER_KIT_KEYS - {"outputRoot"}) & set(payload.keys()):
        value = payload[key]
        if not isinstance(value, list) or not all(
            isinstance(item, str) and item.strip() for item in value
        ):
            errors.append(f"Starter-kit manifest key `{key}` must be a list of strings.")



def validate_runtime_configs(runtime_root: Path, errors: list[str]) -> None:
    yaml_paths = sorted(runtime_root.glob("*.yaml"))
    if not yaml_paths:
        errors.append(f"No runtime config YAML files found under: {runtime_root}")
        return

    for path in yaml_paths:
        try:
            payload = load_yaml(path)
        except yaml.YAMLError as exc:
            errors.append(f"Runtime config `{path}` could not be parsed: {exc}")
            continue

        if not isinstance(payload, dict):
            errors.append(
                f"Runtime config `{path}` must be a top-level mapping, not {type(payload).__name__}."
            )
            continue

        if not payload:
            errors.append(f"Runtime config `{path}` must not be empty.")


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    publication_config_path = Path(args.publication_config).resolve()
    starter_kit_manifest_path = Path(args.starter_kit_manifest).resolve()
    repo_root = infer_repo_root(args.repo_root, publication_config_path, starter_kit_manifest_path)

    errors: list[str] = []

    for path, label in ((publication_config_path, "Publication config"),):
        if not path.exists():
            errors.append(f"{label} path does not exist: {path}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    try:
        publication_config = load_json(publication_config_path)
    except json.JSONDecodeError as exc:
        errors.append(f"Publication config could not be parsed: {exc}")
        publication_config = None


    starter_kit_manifest = None
    if starter_kit_manifest_path.exists():
        try:
            starter_kit_manifest = load_json(starter_kit_manifest_path)
        except json.JSONDecodeError as exc:
            errors.append(f"Starter-kit manifest could not be parsed: {exc}")

    if publication_config is not None:
        validate_publication_config(publication_config, errors)
    if starter_kit_manifest is not None:
        validate_starter_kit_manifest(starter_kit_manifest, errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print("Repo config validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
