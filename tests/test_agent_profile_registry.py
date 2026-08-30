from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_ROOT = ROOT / "scripts"
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

SPEC = importlib.util.spec_from_file_location(
    "agent_profile_registry", SCRIPTS_ROOT / "agent_profile_registry.py"
)
assert SPEC is not None and SPEC.loader is not None
REGISTRY = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = REGISTRY
SPEC.loader.exec_module(REGISTRY)


def write_profile(root: Path, name: str = "normal", rank: int | None = 20, extra: str = "") -> None:
    rank_line = "" if rank is None else f"rank = {rank}\n"
    agents = root / "agents"
    agents.mkdir(parents=True, exist_ok=True)
    (agents / f"{name}.toml").write_text(
        f'name = "{name}"\n'
        'model_provider = "9router"\n'
        f'model = "combo-{name}"\n'
        f'{rank_line}'
        'description = "Profile description"\n'
        'developer_instructions = "Profile instructions"\n'
        f'{extra}',
        encoding="utf-8",
    )


def test_load_profiles_accepts_ranked_and_unranked_profiles(tmp_path: Path) -> None:
    write_profile(tmp_path, "normal", 20)
    write_profile(tmp_path, "ui", None)

    profiles = REGISTRY.load_agent_profiles(tmp_path / "agents")

    assert profiles["normal"].rank == 20
    assert profiles["ui"].rank is None
    assert profiles["ui"].model == "combo-ui"
    assert profiles["ui"].deepagents_compatible is True


def test_repository_review_profile_preserves_specialized_contract() -> None:
    profiles = REGISTRY.load_agent_profiles(ROOT / "agents")
    review = profiles["review"]

    assert review.rank is None
    assert review.model_provider == "9router"
    assert review.model == "combo-review"
    assert review.deepagents_compatible is True

    instructions = review.developer_instructions.lower()
    assert "do not implement" in instructions
    assert "task-specific" in instructions
    assert "pass, fail, or blocked" in instructions


def test_load_profiles_accepts_deepagents_compatibility_override(tmp_path: Path) -> None:
    write_profile(tmp_path, "ui", None, 'deepagents_compatible = false\n')

    profiles = REGISTRY.load_agent_profiles(tmp_path / "agents")

    assert profiles["ui"].deepagents_compatible is False


@pytest.mark.parametrize(
    ("filename", "content", "message"),
    [
        ("bad.toml", "name = \"bad\"\n", "model_provider"),
        ("bad.toml", "name = \"bad\"\nmodel_provider = \"9router\"\nmodel = \"x\"\nrank = 20\ndescription = \"x\"\ndeveloper_instructions = \"x\"\nextra = \"x\"\n", "unsupported keys"),
        ("bad.toml", "name = \"wrong\"\nmodel_provider = \"9router\"\nmodel = \"x\"\nrank = 20\ndescription = \"x\"\ndeveloper_instructions = \"x\"\n", "filename must match"),
        ("bad.toml", "name = \"bad\"\nmodel_provider = \"9router\"\nmodel = \"x\"\nrank = 0\ndescription = \"x\"\ndeveloper_instructions = \"x\"\n", "rank"),
        ("bad.toml", "name = \"bad\"\nmodel_provider = \"9router\"\nmodel = \"x\"\nrank = 20\ndescription = \"x\"\ndeveloper_instructions = \"x\"\nbase_url = \"http://127.0.0.1\"\n", "runtime-owned keys"),
        ("bad.toml", "name = \"bad\"\nmodel_provider = \"9router\"\nmodel = \"x\"\nrank = 20\ndescription = \"x\"\ndeveloper_instructions = \"x\"\ndeepagents_compatible = \"false\"\n", "deepagents_compatible"),
    ],
)
def test_load_profiles_rejects_invalid_sources(
    tmp_path: Path, filename: str, content: str, message: str
) -> None:
    agents = tmp_path / "agents"
    agents.mkdir()
    (agents / filename).write_text(content, encoding="utf-8")

    with pytest.raises(ValueError, match=message):
        REGISTRY.load_agent_profiles(agents)


def test_load_profiles_rejects_duplicate_present_ranks(tmp_path: Path) -> None:
    write_profile(tmp_path, "low", 10)
    write_profile(tmp_path, "ui", 10)

    with pytest.raises(ValueError, match="rank.*unique"):
        REGISTRY.load_agent_profiles(tmp_path / "agents")


def test_load_profiles_rejects_empty_registry(tmp_path: Path) -> None:
    agents = tmp_path / "agents"
    agents.mkdir()

    with pytest.raises(ValueError, match="No agent profiles"):
        REGISTRY.load_agent_profiles(agents)


def test_load_profiles_checks_runtime_provider_when_requested(tmp_path: Path) -> None:
    write_profile(tmp_path, "ui", None)

    with pytest.raises(ValueError, match="does not match runtime provider"):
        REGISTRY.load_agent_profiles(tmp_path / "agents", runtime_provider="other")
