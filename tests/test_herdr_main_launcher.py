from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess

import pytest


ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location(
    "herdr_main_launcher", ROOT / "scripts" / "herdr_main_launcher.py"
)
assert SPEC is not None and SPEC.loader is not None
LAUNCHER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LAUNCHER)


def fake_profile(tmp_path: Path, name: str, rank: int | None) -> None:
    agents = tmp_path / "agents"
    agents.mkdir(exist_ok=True)
    rank_line = "" if rank is None else f"rank = {rank}\n"
    (agents / f"{name}.toml").write_text(
        f'name = "{name}"\n'
        'model_provider = "9router"\n'
        f'model = "combo-{name}"\n'
        f"{rank_line}"
        'description = "test"\n'
        'developer_instructions = "do not modify files"\n',
        encoding="utf-8",
    )


def test_codex_arguments_project_complete_contract(tmp_path: Path) -> None:
    fake_profile(tmp_path, "review", None)
    profile = LAUNCHER._profile(tmp_path / "agents", "review")

    arguments = LAUNCHER._codex_arguments(profile, tmp_path)

    assert arguments[:2] == ["-C", str(tmp_path)]
    assert 'model_provider="9router"' in arguments
    assert 'model="combo-review"' in arguments
    assert 'developer_instructions="do not modify files"' in arguments


def test_redaction_hides_developer_instructions() -> None:
    arguments = ["-c", 'model="combo-xhigh"', "-c", 'developer_instructions="secret"']

    assert LAUNCHER._redacted_arguments(arguments) == [
        "-c",
        'model="combo-xhigh"',
        "-c",
        "developer_instructions=<sha256>",
    ]


def test_codex_home_rejects_duplicate_stop_hook_scopes(tmp_path: Path) -> None:
    codex_home = tmp_path / "codex-home"
    codex_home.mkdir()
    project = tmp_path / "project"
    (project / ".codex").mkdir(parents=True)
    hooks = {"hooks": {"Stop": [{"hooks": [{"type": "command", "command": "probe"}]}]}}
    (codex_home / "hooks.json").write_text(json.dumps(hooks), encoding="utf-8")
    (project / ".codex" / "hooks.json").write_text(json.dumps(hooks), encoding="utf-8")

    with pytest.raises(LAUNCHER.LaunchBlocked, match="duplicate Stop-hook scopes"):
        LAUNCHER._codex_runtime(project, codex_home)


def test_main_starts_with_selected_codex_home(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    codex_home = tmp_path / "codex-home"
    codex_home.mkdir()
    evidence = {"codex": {"codex_home": str(codex_home)}}
    captured: dict[str, object] = {}

    monkeypatch.setattr(LAUNCHER, "resolve_launch", lambda **kwargs: (["herdr"], evidence))

    def fake_run(command, **kwargs):
        captured.update(kwargs)
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr(LAUNCHER, "_run", fake_run)

    assert LAUNCHER.main(
        [
            "--profile",
            "xhigh",
            "--session",
            "codex-probe",
            "--pane",
            "w1:p5",
            "--cwd",
            str(ROOT),
            "--expected-base",
            "HEAD",
        ]
    ) == 0
    assert captured["env"]["CODEX_HOME"] == str(codex_home.resolve())


def test_profiles_share_launch_shape(tmp_path: Path) -> None:
    fake_profile(tmp_path, "normal", 20)
    fake_profile(tmp_path, "ui", None)
    profiles = LAUNCHER.load_agent_profiles(tmp_path / "agents")

    shapes = {
        tuple(LAUNCHER._redacted_arguments(LAUNCHER._codex_arguments(profile, tmp_path)))
        for profile in profiles.values()
    }

    assert len(shapes) == 2
    assert all(shape[:2] == ("-C", str(tmp_path)) for shape in shapes)


def test_missing_executable_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(LAUNCHER.shutil, "which", lambda name: None)

    with pytest.raises(LAUNCHER.LaunchBlocked, match="herdr"):
        LAUNCHER._executable("herdr")


def test_pane_safety_rejects_existing_agent(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    payload = {"result": {"panes": [{"pane_id": "p1", "cwd": str(tmp_path), "agent": "codex"}]}}
    monkeypatch.setattr(LAUNCHER, "_json_command", lambda command, **kwargs: payload)

    with pytest.raises(LAUNCHER.LaunchBlocked, match="already has agent"):
        LAUNCHER._herdr_pane(tmp_path, "session", "p1", "herdr")


def test_git_identity_rejects_non_root_cwd(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    values = iter([str(tmp_path), str(tmp_path / ".git"), "main", "head", "base"])
    monkeypatch.setattr(LAUNCHER, "_git_value", lambda cwd, *args: next(values))

    with pytest.raises(LAUNCHER.LaunchBlocked, match="exact Git worktree root"):
        LAUNCHER._git_identity(tmp_path / "subdir", "base")


def test_main_dry_run_emits_json_and_does_not_start(monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    evidence = {"registry_launcher": {"profile": "xhigh"}}
    monkeypatch.setattr(LAUNCHER, "resolve_launch", lambda **kwargs: (["herdr"], evidence))
    run = monkeypatch.setattr(LAUNCHER, "_run", lambda command: (_ for _ in ()).throw(AssertionError()))

    assert LAUNCHER.main(
        [
            "--profile",
            "xhigh",
            "--session",
            "codex-probe",
            "--pane",
            "w1:p5",
            "--cwd",
            str(ROOT),
            "--expected-base",
            "HEAD",
            "--dry-run",
        ]
    ) == 0
    assert json.loads(capsys.readouterr().out) == evidence
