"""
@meta
name: planning_artifact_schema
type: utility
domain: docs
distribution_tier: starter_kit
responsibility:
  - Load the canonical planning artifact schema from repo_config.
  - Provide narrow helpers for validators that need shared planning metadata rules.
inputs:
  - repo_config/planning_artifact_schema.yaml
outputs:
  - In-memory planning artifact schema payload and helper accessors.
tags:
  - docs
  - planning
  - validation
  - ci-safe
lifecycle:
  status: active
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

SCHEMA_RELATIVE_PATH = Path("repo_config") / "planning_artifact_schema.yaml"


@lru_cache(maxsize=8)
def load_planning_artifact_schema(repo_root: Path) -> dict[str, Any]:
    schema_path = repo_root.resolve() / SCHEMA_RELATIVE_PATH
    with schema_path.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle)
    if not isinstance(payload, dict):
        raise ValueError("planning artifact schema must parse to a top-level mapping")
    return payload


def get_artifact_schema(repo_root: Path, artifact_type: str) -> dict[str, Any]:
    artifacts = load_planning_artifact_schema(repo_root).get("artifacts", {})
    if not isinstance(artifacts, dict):
        raise ValueError("planning artifact schema artifacts section must be a mapping")
    artifact_schema = artifacts.get(artifact_type)
    if not isinstance(artifact_schema, dict):
        raise KeyError(f"unknown planning artifact type: {artifact_type}")
    return artifact_schema


def get_allowed_values(repo_root: Path, field_name: str, artifact_type: str) -> list[str]:
    allowed_values = load_planning_artifact_schema(repo_root).get("allowed_values", {})
    if not isinstance(allowed_values, dict):
        return []
    field_rules = allowed_values.get(field_name, {})
    if not isinstance(field_rules, dict):
        return []
    values = field_rules.get(artifact_type)
    if isinstance(values, list) and all(isinstance(value, str) for value in values):
        return values
    shared_values = field_rules.get("shared")
    if isinstance(shared_values, list) and all(isinstance(value, str) for value in shared_values):
        return shared_values
    return []


def get_required_fields(repo_root: Path, artifact_type: str) -> list[str]:
    schema = load_planning_artifact_schema(repo_root)
    shared_fields = schema.get("shared_base_fields", {})
    required_fields = [
        field
        for field, rules in shared_fields.items()
        if isinstance(field, str)
        and isinstance(rules, dict)
        and rules.get("required") is True
    ] if isinstance(shared_fields, dict) else []
    artifact_fields = get_artifact_schema(repo_root, artifact_type).get("required_fields", [])
    if isinstance(artifact_fields, list):
        required_fields.extend(field for field in artifact_fields if isinstance(field, str))
    return list(dict.fromkeys(required_fields))


def get_required_values(repo_root: Path, artifact_type: str) -> dict[str, str]:
    required_values = get_artifact_schema(repo_root, artifact_type).get("required_values", {})
    if not isinstance(required_values, dict):
        return {}
    return {
        key: value
        for key, value in required_values.items()
        if isinstance(key, str) and isinstance(value, str)
    }
