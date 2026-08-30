"""Launch one registry-bound top-level Codex agent through Herdr."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any

try:
    from agent_profile_registry import AgentProfile, load_agent_profiles
except ModuleNotFoundError:
    from scripts.agent_profile_registry import AgentProfile, load_agent_profiles


class LaunchBlocked(RuntimeError):
    """Raised when a required runtime binding is unavailable or mismatched."""


def _run(
    command: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True, check=False)


def _run_checked(
    command: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> str:
    result = _run(command, cwd=cwd, env=env)
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip()
        raise LaunchBlocked(f"Command failed ({result.returncode}): {' '.join(command)}: {detail}")
    return result.stdout.strip()


def _json_command(command: list[str], *, env: dict[str, str] | None = None) -> dict[str, Any]:
    output = _run_checked(command, env=env)
    try:
        payload = json.loads(output)
    except json.JSONDecodeError as exc:
        raise LaunchBlocked(f"Herdr returned invalid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise LaunchBlocked("Herdr returned a non-object JSON response.")
    return payload


def _result(payload: dict[str, Any], key: str) -> Any:
    result = payload.get("result")
    if not isinstance(result, dict) or key not in result:
        raise LaunchBlocked(f"Herdr response missing result.{key}.")
    return result[key]


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _codex_runtime(cwd: Path, configured_home: Path | None = None) -> dict[str, Any]:
    raw_home = configured_home or Path(os.environ.get("CODEX_HOME") or (Path.home() / ".codex"))
    codex_home = raw_home.expanduser().resolve()
    if not codex_home.is_dir():
        raise LaunchBlocked(f"CODEX_HOME must be an existing directory: {codex_home}")

    stop_hook_scopes: list[str] = []
    for hooks_path in (codex_home / "hooks.json", cwd.resolve() / ".codex" / "hooks.json"):
        if not hooks_path.is_file():
            continue
        try:
            payload = json.loads(hooks_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise LaunchBlocked(f"Cannot read Codex hooks file {hooks_path}: {exc}") from exc
        hooks = payload.get("hooks") if isinstance(payload, dict) else None
        if isinstance(hooks, dict) and hooks.get("Stop"):
            stop_hook_scopes.append(str(hooks_path.resolve()))

    if len(stop_hook_scopes) > 1:
        joined = ", ".join(stop_hook_scopes)
        raise LaunchBlocked(f"duplicate Stop-hook scopes: {joined}")
    return {
        "codex_home": str(codex_home),
        "stop_hook_scopes": stop_hook_scopes,
    }


def _codex_environment(codex_home: Path) -> dict[str, str]:
    environment = os.environ.copy()
    environment["CODEX_HOME"] = str(codex_home.resolve())
    return environment


def _git_value(cwd: Path, *arguments: str) -> str:
    return _run_checked(["git", "-C", str(cwd), *arguments])


def _git_identity(cwd: Path, expected_base: str) -> dict[str, str]:
    worktree = cwd.resolve()
    repo_root = Path(_git_value(worktree, "rev-parse", "--show-toplevel")).resolve()
    if worktree != repo_root:
        raise LaunchBlocked(f"--cwd must equal exact Git worktree root: {worktree}")
    common_dir = Path(_git_value(worktree, "rev-parse", "--git-common-dir"))
    if not common_dir.is_absolute():
        common_dir = (worktree / common_dir).resolve()
    else:
        common_dir = common_dir.resolve()
    branch = _git_value(worktree, "branch", "--show-current")
    head = _git_value(worktree, "rev-parse", "HEAD")
    expected = _git_value(worktree, "rev-parse", "--verify", f"{expected_base}^{{commit}}")
    return {
        "worktree": str(worktree),
        "repo_root": str(repo_root),
        "git_common_dir": str(common_dir),
        "branch": branch,
        "head": head,
        "expected_base": expected,
    }


def _executable(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise LaunchBlocked(f"Required executable unavailable on PATH: {name}")
    return str(Path(path).resolve())


def _version(path: str, *, env: dict[str, str] | None = None) -> str:
    output = _run_checked([path, "--version"], env=env)
    return output.splitlines()[0] if output else ""


def _profile(agents_root: Path, name: str) -> AgentProfile:
    try:
        profiles = load_agent_profiles(agents_root)
    except (OSError, ValueError) as exc:
        raise LaunchBlocked(str(exc)) from exc
    selected = profiles.get(name)
    if selected is None:
        raise LaunchBlocked(f"Unknown agent profile: {name}")
    return selected


def _herdr_pane(
    cwd: Path,
    session: str,
    pane: str,
    herdr: str,
    *,
    env: dict[str, str] | None = None,
) -> dict[str, Any]:
    panes = _result(_json_command([herdr, "--session", session, "pane", "list"], env=env), "panes")
    if not isinstance(panes, list):
        raise LaunchBlocked("Herdr pane list is not an array.")
    selected = next((item for item in panes if item.get("pane_id") == pane), None)
    if not isinstance(selected, dict):
        raise LaunchBlocked(f"Pane is unavailable in session `{session}`: {pane}")
    pane_cwd = Path(str(selected.get("cwd", ""))).resolve()
    if pane_cwd != cwd.resolve():
        raise LaunchBlocked(f"Pane cwd mismatch: expected {cwd}, got {pane_cwd}")
    if selected.get("agent") or selected.get("agent_status") not in (None, "unknown"):
        raise LaunchBlocked(f"Pane already has agent state: {pane}")

    process_payload = _json_command(
        [herdr, "--session", session, "pane", "process-info", "--pane", pane],
        env=env,
    )
    process_info = _result(process_payload, "process_info")
    foreground = process_info.get("foreground_processes", [])
    if not isinstance(foreground, list):
        raise LaunchBlocked("Herdr pane process information is invalid.")
    shell_names = {"powershell.exe", "pwsh.exe", "cmd.exe", "bash", "sh", "zsh", "fish"}
    conflicting = [
        process.get("name", "unknown")
        for process in foreground
        if str(process.get("name", "")).lower() not in shell_names
    ]
    if conflicting:
        raise LaunchBlocked(f"Pane has conflicting foreground process: {', '.join(conflicting)}")
    return {"pane": selected, "process_info": process_info}


def _codex_arguments(profile: AgentProfile, cwd: Path) -> list[str]:
    return [
        "-C",
        str(cwd),
        "-c",
        f"model_provider={json.dumps(profile.model_provider)}",
        "-c",
        f"model={json.dumps(profile.model)}",
        "-c",
        f"developer_instructions={json.dumps(profile.developer_instructions)}",
    ]


def _redacted_arguments(arguments: list[str]) -> list[str]:
    redacted: list[str] = []
    index = 0
    while index < len(arguments):
        value = arguments[index]
        if value == "-c" and index + 1 < len(arguments):
            setting = arguments[index + 1]
            if setting.startswith("developer_instructions="):
                setting = "developer_instructions=<sha256>"
            redacted.extend([value, setting])
            index += 2
            continue
        redacted.append(value)
        index += 1
    return redacted


def resolve_launch(
    *,
    profile_name: str,
    session: str,
    pane: str,
    cwd: Path,
    expected_base: str,
    name: str | None = None,
    codex_home: Path | None = None,
) -> tuple[list[str], dict[str, Any]]:
    repo_root = Path(__file__).resolve().parents[1]
    selected = _profile(repo_root / "agents", profile_name)
    runtime = _codex_runtime(cwd, codex_home)
    environment = _codex_environment(Path(runtime["codex_home"]))
    herdr = _executable("herdr")
    codex = _executable("codex")
    git = _git_identity(cwd, expected_base)
    pane_state = _herdr_pane(cwd, session, pane, herdr, env=environment)
    agent_name = name or f"{selected.name}-main"
    codex_arguments = _codex_arguments(selected, cwd)
    command = [
        herdr,
        "--session",
        session,
        "agent",
        "start",
        agent_name,
        "--kind",
        "codex",
        "--pane",
        pane,
        "--",
        *codex_arguments,
    ]
    evidence = {
        "registry_launcher": {
            "profile": selected.name,
            "profile_source": str(selected.source),
            "executor": "codex",
            "model_provider": selected.model_provider,
            "model": selected.model,
            "developer_instructions_sha256": _sha256_text(selected.developer_instructions),
            "projected_config_keys": [
                "model_provider",
                "model",
                "developer_instructions",
            ],
            "redacted_codex_argv": _redacted_arguments(codex_arguments),
        },
        "git": git,
        "herdr": {
            "executable": herdr,
            "version": _version(herdr, env=environment),
            "session": session,
            "pane": pane,
            "agent_name": agent_name,
            "agent_kind": "codex",
            "pane_cwd": str(Path(str(pane_state["pane"].get("cwd"))).resolve()),
        },
        "codex": {
            "executable": codex,
            "version": _version(codex, env=environment),
            **runtime,
            "argv_shape": _redacted_arguments(codex_arguments),
        },
    }
    return command, evidence


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--session", required=True)
    parser.add_argument("--pane", required=True)
    parser.add_argument("--cwd", required=True, type=Path)
    parser.add_argument("--expected-base", required=True)
    parser.add_argument("--name")
    parser.add_argument("--codex-home", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        command, evidence = resolve_launch(
            profile_name=args.profile,
            session=args.session,
            pane=args.pane,
            cwd=args.cwd,
            expected_base=args.expected_base,
            name=args.name,
            codex_home=args.codex_home,
        )
        print(json.dumps(evidence, sort_keys=True))
        if args.dry_run:
            return 0
        codex_evidence = evidence.get("codex")
        if not isinstance(codex_evidence, dict) or not codex_evidence.get("codex_home"):
            raise LaunchBlocked("Launcher evidence missing codex_home.")
        result = _run(command, env=_codex_environment(Path(str(codex_evidence["codex_home"]))))
        if result.stdout:
            print(result.stdout, end="")
        if result.stderr:
            print(result.stderr, file=sys.stderr, end="")
        return result.returncode
    except LaunchBlocked as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
