"""Launch DeepAgents with local Codex binding and shared project roles."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tomllib


_ROLE_VIEWS_MARKER = ".dcode-project-owned"
_ROLE_VIEWS_SCHEMA = 1
_LEGACY_ROLE_VIEWS_MARKER = "dcode-project owns this directory.\n"
_HANDOFF_SCHEMA = "codex.mcp.handoff.v1"
_HANDOFF_MAX_BYTES = 262_144
_HANDOFF_MAX_SOURCES = 64
_HANDOFF_MAX_FACTS = 256
_HANDOFF_MAX_STRING = 4_096
_HANDOFF_MAX_DEPTH = 16
_HANDOFF_MAX_AGE = timedelta(hours=24)
_HANDOFF_ROOT_PARTS = (".local", "share", "dcode-project", "handoffs")
_SENSITIVE_NAME = re.compile(
    r"(?:api[_-]?key|authorization|cookie|credential|password|secret|token|raw[_-]?(?:body|header|network))",
    re.IGNORECASE,
)
_SENSITIVE_VALUE = re.compile(
    r"(?:bearer\s+\S+|sk-[A-Za-z0-9_-]{8,}|api[_-]?key\s*[:=]\s*\S+)",
    re.IGNORECASE,
)
_ALLOWED_RUNTIME_FLAGS = {
    "--print-config",
    "--json",
    "-q",
    "--quiet",
    "--no-stream",
    "--no-mcp",
}
_ALLOWED_RUNTIME_VALUE_OPTIONS = {
    "-n",
    "--non-interactive",
    "--max-turns",
    "--timeout",
    "--goal",
    "--rubric",
    "--rubric-max-iterations",
    "--recursion-limit",
    "--mcp-select",
    "--handoff-file",
    "--role",
}
_FIXED_LOCAL_CAPABILITY_OPTIONS = (
    "--allow-fs-tools",
    "all",
    "--shell-allow-list",
    "git,py",
)


def _config_path() -> Path:
    override = os.environ.get("DCODE_PROJECT_CONFIG")
    if override:
        return Path(override).expanduser().resolve()
    return Path.home() / ".local" / "share" / "dcode-project" / "config.toml"


def _reject_unmanaged_runtime_options(argv: list[str]) -> None:
    index = 0
    while index < len(argv):
        argument = argv[index]
        option = argument.split("=", 1)[0]
        if option == "--stdin":
            raise RuntimeError(
                "dcode-project does not accept direct `--stdin`; pass a validated "
                "`--handoff-file <absolute-path>` with `-n <task>`."
            )
        if option in _ALLOWED_RUNTIME_FLAGS:
            index += 1
            continue
        if option in _ALLOWED_RUNTIME_VALUE_OPTIONS:
            if "=" not in argument:
                if index + 1 >= len(argv) or argv[index + 1].startswith("-"):
                    raise RuntimeError(f"dcode-project requires a value for `{option}`.")
                index += 2
                continue
            index += 1
            continue
        raise RuntimeError(
            f"dcode-project does not permit `{option}`. Current launcher has no Codex "
            "permission or MCP projection; use its fixed local binding and no-MCP path."
        )


def _load_toml(path: Path, label: str) -> dict[str, object]:
    try:
        with path.open("rb") as handle:
            payload = tomllib.load(handle)
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise RuntimeError(f"Cannot read {label}: {path}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError(f"Invalid {label}: {path}")
    return payload


def _required_string(values: dict[str, object], key: str, label: str) -> str:
    value = values.get(key)
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f"Missing {label} `{key}`.")
    return value.strip()


def _read_env_value(path: Path, key: str) -> str:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise RuntimeError(f"Cannot read secret file: {path}") from exc
    for line in lines:
        candidate = line.strip()
        if not candidate or candidate.startswith("#"):
            continue
        if candidate.startswith("export "):
            candidate = candidate[7:].lstrip()
        name, separator, value = candidate.partition("=")
        if separator and name.strip() == key:
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
                value = value[1:-1]
            if value:
                return value
    raise RuntimeError(f"Secret key `{key}` is absent or empty in {path}.")


def _repo_root() -> Path:
    completed = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode:
        raise RuntimeError("Run dcode-project inside a Git repository.")
    return Path(completed.stdout.strip()).resolve()


def _load_roles(
    repo_root: Path,
    runtime_provider: str,
) -> list[dict[str, object]]:
    roles_root = repo_root / "agents"
    roles: list[dict[str, object]] = []
    ranks: set[int] = set()
    for source in sorted(roles_root.glob("*.toml")):
        values = _load_toml(source, "role template")
        required = {"name", "model_provider", "model", "rank", "description", "developer_instructions"}
        if set(values) != required:
            raise RuntimeError(f"Unsupported role template fields: {source}")
        name = _required_string(values, "name", str(source))
        if source.stem != name:
            raise RuntimeError(f"Role filename must match name: {source}")
        model_provider = _required_string(values, "model_provider", str(source))
        if model_provider != runtime_provider:
            raise RuntimeError(
                f"Role provider `{model_provider}` does not match runtime provider `{runtime_provider}`: {source}"
            )
        rank = values.get("rank")
        if isinstance(rank, bool) or not isinstance(rank, int) or rank <= 0:
            raise RuntimeError(f"Role rank must be a positive integer: {source}")
        if rank in ranks:
            raise RuntimeError(f"Role ranks must be unique: {source}")
        ranks.add(rank)
        roles.append(
            {
                "name": name,
                "model_provider": model_provider,
                "rank": rank,
                "description": _required_string(values, "description", str(source)),
                "developer_instructions": _required_string(
                    values, "developer_instructions", str(source)
                ),
                "model": _required_string(values, "model", str(source)),
            }
        )
    if not roles:
        raise RuntimeError(f"No role templates found: {roles_root}")
    return roles


def _role_view_path(agents_root: Path, role_name: str) -> Path:
    return agents_root / role_name / "AGENTS.md"


def _role_view_content(role: dict[str, object]) -> str:
    model = f"openai:{role['model']}"
    return (
        "---\n"
        f"name: {json.dumps(role['name'])}\n"
        f"description: {json.dumps(role['description'])}\n"
        f"model: {json.dumps(model)}\n"
        "---\n\n"
        f"{role['developer_instructions']}\n"
    )


def _owned_views_marker(roles: list[dict[str, object]]) -> str:
    views = {
        role["name"]: _role_view_content(role)
        for role in roles
    }
    return json.dumps(
        {"schema": _ROLE_VIEWS_SCHEMA, "views": views},
        sort_keys=True,
    ) + "\n"


def _read_owned_views(marker: Path, roles: list[dict[str, object]]) -> dict[str, str]:
    if marker.is_symlink() or not marker.is_file():
        raise RuntimeError(f"Cannot verify owned DeepAgents role views: {marker}")
    try:
        marker_content = marker.read_text(encoding="utf-8")
    except OSError as exc:
        raise RuntimeError(f"Cannot verify owned DeepAgents role views: {marker}") from exc
    if marker_content == _LEGACY_ROLE_VIEWS_MARKER:
        return {role["name"]: _role_view_content(role) for role in roles}
    try:
        payload = json.loads(marker_content)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Cannot verify owned DeepAgents role views: {marker}") from exc
    if not isinstance(payload, dict) or payload.get("schema") != _ROLE_VIEWS_SCHEMA:
        raise RuntimeError(f"Cannot verify owned DeepAgents role views: {marker}")
    views = payload.get("views")
    if not isinstance(views, dict) or not all(
        isinstance(name, str)
        and name
        and Path(name).name == name
        and isinstance(content, str)
        for name, content in views.items()
    ):
        raise RuntimeError(f"Cannot verify owned DeepAgents role views: {marker}")
    return views


def _unlink_if_exact(path: Path, expected: str) -> None:
    if path.is_symlink() or not path.is_file():
        return
    try:
        current = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return
    if current == expected:
        path.unlink()


def _remove_empty_parents(path: Path, stop_at: Path) -> None:
    current = path
    while current != stop_at:
        try:
            current.rmdir()
        except OSError:
            return
        current = current.parent


def _remove_owned_views(agents_root: Path, views: dict[str, str]) -> None:
    for role_name, content in views.items():
        destination = _role_view_path(agents_root, role_name)
        _unlink_if_exact(destination, content)
        _remove_empty_parents(destination.parent, agents_root)


def _has_unowned_role_content(agents_root: Path, marker: Path, views: dict[str, str]) -> bool:
    for path in agents_root.rglob("*"):
        if path == marker or (not path.is_file() and not path.is_symlink()):
            continue
        expected = next(
            (
                content
                for role_name, content in views.items()
                if path == _role_view_path(agents_root, role_name)
            ),
            None,
        )
        if expected is None or path.is_symlink():
            return True
        try:
            if path.read_text(encoding="utf-8") != expected:
                return True
        except (OSError, UnicodeDecodeError):
            return True
    return False


def _remove_role_views(repo_root: Path, roles: list[dict[str, str]]) -> None:
    agents_root = repo_root / ".deepagents" / "agents"
    marker = agents_root / _ROLE_VIEWS_MARKER
    if not marker.exists():
        return
    _remove_owned_views(agents_root, _read_owned_views(marker, roles))
    marker.unlink()
    _remove_empty_parents(agents_root, repo_root)


def _write_role_views(repo_root: Path, roles: list[dict[str, object]]) -> Path:
    agents_root = repo_root / ".deepagents" / "agents"
    marker = agents_root / _ROLE_VIEWS_MARKER
    if not agents_root.exists():
        agents_root.mkdir(parents=True)
    previous_views = _read_owned_views(marker, roles) if marker.exists() else {}
    if _has_unowned_role_content(agents_root, marker, previous_views):
        raise RuntimeError(f"Refusing to replace user-owned DeepAgents roles: {agents_root}")
    if marker.exists():
        _remove_owned_views(agents_root, previous_views)
    for role in roles:
        destination = _role_view_path(agents_root, role["name"])
        if destination.exists() or destination.is_symlink():
            raise RuntimeError(f"Refusing to replace user-owned DeepAgents role view: {destination}")
    marker.write_text(_owned_views_marker(roles), encoding="utf-8")
    try:
        for role in roles:
            destination = _role_view_path(agents_root, role["name"])
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(_role_view_content(role), encoding="utf-8")
    except OSError:
        _remove_role_views(repo_root, roles)
        raise
    return agents_root


def _runtime_binding(config: dict[str, object]) -> tuple[str, str, str, str]:
    paths = config.get("paths")
    if not isinstance(paths, dict):
        raise RuntimeError("Missing local `[paths]` configuration.")
    codex_config = Path(_required_string(paths, "codex_config", "local paths")).expanduser()
    secret_file = Path(_required_string(paths, "secret_file", "local paths")).expanduser()
    secret_key = _required_string(paths, "secret_key", "local paths")
    codex = _load_toml(codex_config, "Codex config")
    provider_name = _required_string(codex, "model_provider", "Codex config")
    model = _required_string(codex, "model", "Codex config")
    providers = codex.get("model_providers")
    if not isinstance(providers, dict):
        raise RuntimeError("Missing Codex `model_providers` configuration.")
    provider = providers.get(provider_name)
    if not isinstance(provider, dict):
        raise RuntimeError(f"Active Codex provider is unavailable: {provider_name}")
    base_url = _required_string(provider, "base_url", "active Codex provider")
    return model, base_url, _read_env_value(secret_file, secret_key), provider_name

def _codex_config(config: dict[str, object]) -> dict[str, object]:
    paths = config.get("paths")
    if not isinstance(paths, dict):
        raise RuntimeError("Missing local `[paths]` configuration.")
    path = Path(_required_string(paths, "codex_config", "local paths")).expanduser()
    return _load_toml(path, "Codex config")

def _mcp_capabilities(codex_config: dict[str, object]) -> dict[str, object]:
    servers = codex_config.get("mcp_servers", {})
    if not isinstance(servers, dict):
        raise RuntimeError("Invalid Codex `[mcp_servers]` configuration.")
    normalized: dict[str, list[str]] = {}
    for server_name, server_config in servers.items():
        if not isinstance(server_name, str) or not server_name.strip():
            raise RuntimeError("Codex MCP server names must be non-empty strings.")
        if not isinstance(server_config, dict):
            normalized[server_name] = []
            continue
        tools = server_config.get("tools", {})
        if not isinstance(tools, dict):
            tools = {}
        normalized[server_name] = sorted(
            tool_name
            for tool_name in tools
            if isinstance(tool_name, str) and tool_name.strip()
        )
    server_ids = sorted(normalized)
    tool_ids = sorted(
        f"{server}.{tool}"
        for server, tools in normalized.items()
        for tool in tools
    )
    runtime = {
        "mcp_servers": normalized,
    }
    capability_digest = _sha256_json(runtime)
    return {
        "mcp_servers": server_ids,
        "mcp_tools": tool_ids,
        "server_tools": normalized,
        "mcp_capability_digest": capability_digest,
    }

def _sha256_json(value: object) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()

def _runtime_binding_digest(
    provider_name: str,
    model: str,
    base_url: str,
) -> str:
    return _sha256_json(
        {"base_url": base_url, "model": model, "provider": provider_name}
    )

def _parse_mcp_selection(values: list[str], capabilities: dict[str, object]) -> list[str]:
    server_tools = capabilities["server_tools"]
    if not isinstance(server_tools, dict):
        raise RuntimeError("Invalid MCP capability projection.")
    if not values:
        return sorted(
            list(capabilities["mcp_servers"])
            + list(capabilities["mcp_tools"])
        )
    selected: set[str] = set()
    for value in values:
        for selector in value.split(","):
            selector = selector.strip()
            if not selector:
                continue
            server, separator, tool = selector.partition(".")
            if server not in server_tools:
                raise RuntimeError(f"Unknown MCP server selection `{server}`.")
            if separator:
                tools = server_tools[server]
                if not isinstance(tools, list) or tool not in tools:
                    raise RuntimeError(f"Unknown MCP tool selection `{selector}`.")
            selected.add(selector)
    return sorted(selected)

def _controller_options(argv: list[str]) -> tuple[list[str], list[str], str | None, str | None]:
    child: list[str] = []
    selections: list[str] = []
    handoff_file: str | None = None
    role_name: str | None = None
    index = 0
    while index < len(argv):
        argument = argv[index]
        option, separator, inline_value = argument.partition("=")
        if option in {"--mcp-select", "--handoff-file", "--role"}:
            if separator:
                value = inline_value
            elif index + 1 < len(argv):
                value = argv[index + 1]
                index += 1
            else:
                raise RuntimeError(f"dcode-project requires a value for `{option}`.")
            if not value:
                raise RuntimeError(f"dcode-project requires a value for `{option}`.")
            if option == "--mcp-select":
                selections.append(value)
            elif option == "--role":
                if role_name is not None:
                    raise RuntimeError("dcode-project accepts only one `--role`.")
                role_name = value
            elif handoff_file is not None:
                raise RuntimeError("dcode-project accepts only one `--handoff-file`.")
            else:
                handoff_file = value
        else:
            child.append(argument)
        index += 1
    return child, selections, handoff_file, role_name

def _handoff_root() -> Path:
    return Path.home().joinpath(*_HANDOFF_ROOT_PARTS)

def _safe_handoff_path(raw_path: str) -> Path:
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        raise RuntimeError("Handoff path must be absolute.")
    root = _handoff_root().resolve()
    try:
        relative = candidate.relative_to(root)
    except ValueError as exc:
        raise RuntimeError(f"Handoff path must stay under `{root}`.") from exc
    current = root
    for part in relative.parts:
        current /= part
        if current.is_symlink():
            raise RuntimeError("Handoff path cannot contain symlinks.")
    if not candidate.is_file() or candidate.is_symlink():
        raise RuntimeError(f"Handoff file is missing or not a regular file: {candidate}")
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(root)
    except (OSError, ValueError) as exc:
        raise RuntimeError("Handoff path resolves outside approved root.") from exc
    return candidate

def _parse_timestamp(value: object) -> datetime:
    if not isinstance(value, str) or len(value) > 64:
        raise RuntimeError("Handoff `generated_at` must be RFC3339 text.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RuntimeError("Handoff `generated_at` must be RFC3339 text.") from exc
    if parsed.tzinfo is None:
        raise RuntimeError("Handoff `generated_at` must include timezone.")
    return parsed.astimezone(timezone.utc)

def _reject_sensitive_value(value: object, depth: int = 0) -> None:
    if depth > _HANDOFF_MAX_DEPTH:
        raise RuntimeError("Handoff value nesting is too deep.")
    if isinstance(value, str):
        if len(value) > _HANDOFF_MAX_STRING or _SENSITIVE_VALUE.search(value):
            raise RuntimeError("Handoff contains sensitive or oversized text.")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > _HANDOFF_MAX_STRING:
                raise RuntimeError("Handoff object keys are invalid.")
            if _SENSITIVE_NAME.search(key):
                raise RuntimeError("Handoff contains sensitive field names.")
            _reject_sensitive_value(item, depth + 1)
        return
    if isinstance(value, list):
        for item in value:
            _reject_sensitive_value(item, depth + 1)
        return
    if value is not None and not isinstance(value, (bool, int, float)):
        raise RuntimeError("Handoff contains unsupported value type.")

def _validate_handoff(
    raw_path: str,
    capabilities: dict[str, object],
    selected: list[str],
) -> tuple[Path, dict[str, object]]:
    path = _safe_handoff_path(raw_path)
    if path.stat().st_size > _HANDOFF_MAX_BYTES:
        raise RuntimeError("Handoff file exceeds size limit.")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("Handoff file is not valid UTF-8 JSON.") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Handoff root must be an object.")
    required = {"schema", "generated_at", "mcp_capability_digest", "sources", "facts"}
    allowed = required | {"constraints"}
    if set(payload) - allowed or not required <= set(payload):
        raise RuntimeError("Handoff fields do not match codex.mcp.handoff.v1.")
    if payload["schema"] != _HANDOFF_SCHEMA:
        raise RuntimeError("Unsupported handoff schema.")
    generated_at = _parse_timestamp(payload["generated_at"])
    now = datetime.now(timezone.utc)
    if generated_at > now + timedelta(minutes=5) or now - generated_at > _HANDOFF_MAX_AGE:
        raise RuntimeError("Handoff is stale or from the future.")
    if payload["mcp_capability_digest"] != capabilities["mcp_capability_digest"]:
        raise RuntimeError("Handoff MCP capability digest does not match current Codex config.")
    sources = payload["sources"]
    facts = payload["facts"]
    if not isinstance(sources, list) or len(sources) > _HANDOFF_MAX_SOURCES:
        raise RuntimeError("Handoff sources are invalid or exceed limit.")
    if not isinstance(facts, list) or len(facts) > _HANDOFF_MAX_FACTS:
        raise RuntimeError("Handoff facts are invalid or exceed limit.")
    selected_set = set(selected)
    source_keys: list[str] = []
    server_tools = capabilities["server_tools"]
    for source in sources:
        if not isinstance(source, dict) or set(source) - {"server", "tool"} or "server" not in source:
            raise RuntimeError("Handoff source shape is invalid.")
        server = source["server"]
        tool = source.get("tool")
        if not isinstance(server, str) or not server or len(server) > _HANDOFF_MAX_STRING:
            raise RuntimeError("Handoff source server is invalid.")
        if server not in server_tools:
            raise RuntimeError(f"Handoff source server is unknown: {server}")
        if tool is not None and (not isinstance(tool, str) or not tool or len(tool) > _HANDOFF_MAX_STRING):
            raise RuntimeError("Handoff source tool is invalid.")
        if tool is not None and tool not in server_tools[server]:
            raise RuntimeError(f"Handoff source tool is unknown: {server}.{tool}")
        source_key = f"{server}.{tool}" if tool is not None else server
        if source_key in source_keys:
            raise RuntimeError("Handoff sources must be unique.")
        if selected and source_key not in selected_set:
            raise RuntimeError(f"Handoff source was not selected: {source_key}")
        source_keys.append(source_key)
    for fact in facts:
        if not isinstance(fact, dict) or set(fact) != {"source", "value"}:
            raise RuntimeError("Handoff fact shape is invalid.")
        source_index = fact["source"]
        if not isinstance(source_index, int) or isinstance(source_index, bool) or not 0 <= source_index < len(sources):
            raise RuntimeError("Handoff fact source index is invalid.")
        _reject_sensitive_value(fact["value"])
    constraints = payload.get("constraints", [])
    if not isinstance(constraints, list) or len(constraints) > 32 or any(
        not isinstance(item, str) or len(item) > _HANDOFF_MAX_STRING for item in constraints
    ):
        raise RuntimeError("Handoff constraints are invalid.")
    return path, payload

def _handoff_stdin(argv: list[str], payload: dict[str, object]) -> str:
    delegated_payload = {
        "schema": payload["schema"],
        "sources": payload["sources"],
        "facts": payload["facts"],
        "constraints": payload.get("constraints", []),
    }
    instruction = (
        " Use this validated Codex MCP handoff payload: "
        f"{json.dumps(delegated_payload, separators=(',', ':'), sort_keys=True)}. "
        "Use only its facts; do not call MCP tools."
    )
    for index, argument in enumerate(argv):
        if argument in {"-n", "--non-interactive"}:
            if index + 1 >= len(argv) or argv[index + 1].startswith("-"):
                raise RuntimeError("Handoff task text is missing.")
            task = argv[index + 1] + instruction
            argv[index : index + 2] = ["--stdin"]
            return task
        for option in ("-n=", "--non-interactive="):
            if argument.startswith(option):
                task = argument[len(option) :] + instruction
                argv[index] = "--stdin"
                return task
    raise RuntimeError("`--handoff-file` requires non-interactive task text via `-n`.")


def _native_file_tool_root(repo_root: Path) -> str:
    resolved_root = repo_root.resolve()
    if resolved_root.drive:
        return "/" + resolved_root.relative_to(Path(resolved_root.anchor)).as_posix()
    return resolved_root.as_posix()


def _bounded_task_context(repo_root: Path) -> str:
    return (
        " Native filesystem tool root: "
        f"`{_native_file_tool_root(repo_root)}`. Use this exact prefix for file paths; "
        "do not use `/workspace/...` or Windows drive syntax. Read only named source, test, "
        "and text files with filesystem tools. Never use filesystem tools on database, binary, "
        "archive, or runtime artifacts; examples: `*.sqlite`, `*.sqlite3`, `*.db`, `*-wal`, "
        "`*-shm`, `*-journal`, `*.zip`, `*.tar`, `*.gz`, `*.7z`, `*.bin`, `*.exe`, images, "
        "or media. For SQLite evidence, use launcher-authorized `py` from repository root with "
        "stdlib `sqlite3` read-only URI mode: "
        '`sqlite3.connect("file:<repo-relative-path>?mode=ro", uri=True)`. Run `py` directly; '
        "do not prefix it with `cd`, shell operators, or wrappers. For `py -c`, use one "
        "expression; never use `;`."
    )


def _append_bounded_task_context(argv: list[str], repo_root: Path) -> None:
    context = _bounded_task_context(repo_root)
    for index, argument in enumerate(argv):
        if argument in {"-n", "--non-interactive"}:
            if index + 1 >= len(argv) or argv[index + 1].startswith("-"):
                raise RuntimeError("DeepAgents task text is missing.")
            argv[index + 1] += context
            return
        for option in ("-n=", "--non-interactive="):
            if argument.startswith(option):
                argv[index] += context
                return


def _find_dcode() -> str | None:
    return shutil.which("dcode") or next(
        (
            str(candidate)
            for candidate in (
                Path.home() / ".local" / "bin" / "dcode.exe",
                Path.home() / ".local" / "bin" / "dcode",
            )
            if candidate.is_file()
        ),
        None,
    )


def _runtime_environment(base_url: str, api_key: str) -> dict[str, str]:
    environment = os.environ.copy()
    environment["PYTHONUTF8"] = "1"
    environment["PYTHONIOENCODING"] = "utf-8"
    environment["DEEPAGENTS_CODE_OPENAI_BASE_URL"] = base_url
    environment["DEEPAGENTS_CODE_OPENAI_API_KEY"] = api_key
    environment["OPENAI_BASE_URL"] = base_url
    environment["OPENAI_API_KEY"] = api_key
    return environment


def _reject_conflicting_user_openai_base_url() -> None:
    config_path = Path.home() / ".deepagents" / "config.toml"
    if not config_path.exists():
        return
    values = _load_toml(config_path, "DeepAgents user config")
    models = values.get("models")
    providers = models.get("providers") if isinstance(models, dict) else None
    openai = providers.get("openai") if isinstance(providers, dict) else None
    if isinstance(openai, dict) and isinstance(openai.get("base_url"), str) and openai["base_url"].strip():
        raise RuntimeError(
            f"Remove conflicting OpenAI base_url from user config: {config_path}"
        )


def main(argv: list[str]) -> int:
    _reject_unmanaged_runtime_options(argv)
    child_argv, selection_values, handoff_file, role_name = _controller_options(argv)
    config = _load_toml(_config_path(), "dcode-project config")
    repo_root = _repo_root()
    model, base_url, api_key, provider_name = _runtime_binding(config)
    codex_config = _codex_config(config)
    capabilities = _mcp_capabilities(codex_config)
    selected = _parse_mcp_selection(selection_values, capabilities)
    roles = _load_roles(repo_root, provider_name)
    role_by_name = {str(role["name"]): role for role in roles}
    selected_role = role_by_name.get(role_name) if role_name is not None else None
    if role_name is not None and selected_role is None:
        raise RuntimeError(f"Unknown role `{role_name}`.")
    if "--print-config" in child_argv and len(child_argv) == 1:
        payload: dict[str, object] = {
            "controller_model": f"openai:{model}",
            "provider": provider_name,
            "role_models": {str(role["name"]): f"openai:{role['model']}" for role in roles},
            "mcp_servers": capabilities["mcp_servers"],
            "mcp_tools": capabilities["mcp_tools"],
            "selected_mcp": selected,
            "runtime_binding_digest": _runtime_binding_digest(
                provider_name,
                model,
                base_url,
            ),
            "mcp_capability_digest": capabilities["mcp_capability_digest"],
            "roles_path": str(repo_root / ".deepagents" / "agents"),
        }
        if selected_role is not None:
            payload["selected_role"] = selected_role["name"]
            payload["effective_model"] = f"openai:{selected_role['model']}"
        print(
            json.dumps(payload, sort_keys=True)
        )
        return 0
    if selected_role is None:
        raise RuntimeError("dcode-project requires `--role <low|normal|high|xhigh>` for task execution.")
    _append_bounded_task_context(child_argv, repo_root)
    handoff_stdin: str | None = None
    if handoff_file is not None:
        _, payload = _validate_handoff(handoff_file, capabilities, selected)
        handoff_stdin = _handoff_stdin(child_argv, payload)
    _reject_conflicting_user_openai_base_url()
    dcode = _find_dcode()
    if not dcode:
        raise RuntimeError("DeepAgents Code is not installed. Run scripts/setup_deepagents_runtime.ps1.")
    environment = _runtime_environment(base_url, api_key)
    _write_role_views(repo_root, roles)
    try:
        completed = subprocess.run(
            [
                dcode,
                "-M",
                f"openai:{selected_role['model']}",
                *_FIXED_LOCAL_CAPABILITY_OPTIONS,
                *(arg for arg in child_argv if arg != "--no-mcp"),
                "--no-mcp",
            ],
            env=environment,
            cwd=repo_root,
            input=handoff_stdin,
            text=handoff_stdin is not None,
        )
        return completed.returncode
    finally:
        _remove_role_views(repo_root, roles)


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except RuntimeError as exc:
        print(f"dcode-project: {exc}", file=sys.stderr)
        raise SystemExit(2)
