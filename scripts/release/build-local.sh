#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
NODE_BIN="${NODE_BIN:-$(command -v node || command -v node.exe || true)}"
if [[ -z "${NODE_BIN}" ]]; then
  printf '%s\n' "Node.js executable not found (expected node or node.exe)." >&2
  exit 1
fi
to_node_path() {
  if [[ "${NODE_BIN}" == *.exe ]] && command -v wslpath >/dev/null 2>&1; then
    local windows_path
    windows_path="$(wslpath -w "$1")"
    printf '%s\n' "${windows_path//\\//}"
  else
    printf '%s\n' "$1"
  fi
}
NODE_REPO_ROOT="$(to_node_path "${REPO_ROOT}")"
NODE_SCRIPT_DIR="$(to_node_path "${SCRIPT_DIR}")"
VERSION="${1:-$("${NODE_BIN}" -p "require('${NODE_REPO_ROOT}/package.json').version")}"
OUTPUT_ROOT="${RELEASE_OUTPUT_DIR:-${REPO_ROOT}/release-artifacts}"
OUTPUT_DIR="${OUTPUT_ROOT}/v${VERSION}"
NODE_OUTPUT_DIR="$(to_node_path "${OUTPUT_DIR}")"
GIT_BIN="${GIT_BIN:-$(command -v git || command -v git.exe || true)}"
GIT_REPO_ROOT="${REPO_ROOT}"
if [[ -f "${REPO_ROOT}/.git" ]] && command -v git.exe >/dev/null 2>&1 && command -v wslpath >/dev/null 2>&1; then
  GIT_BIN="$(command -v git.exe)"
  GIT_REPO_ROOT="$(wslpath -w "${REPO_ROOT}")"
  GIT_REPO_ROOT="${GIT_REPO_ROOT//\\//}"
fi
if [[ -z "${GIT_BIN}" ]]; then
  printf '%s\n' "Git executable not found (expected git or git.exe)." >&2
  exit 1
fi
PNPM_CMD=(pnpm)
if [[ "${NODE_BIN}" == *.exe ]] && command -v cmd.exe >/dev/null 2>&1; then
  PNPM_CMD=(cmd.exe /d /c pnpm)
fi

cd "${REPO_ROOT}"

TRACKED_STATUS="$("${GIT_BIN}" -C "${GIT_REPO_ROOT}" status --porcelain=v1 --untracked-files=no)"
DIRTY=false
if [[ -n "${TRACKED_STATUS}" ]]; then
  DIRTY=true
  if [[ "${RELEASE_ALLOW_DIRTY:-0}" != "1" ]]; then
    printf '%s\n' "Release candidates must be built from a clean tracked worktree." >&2
    printf '%s\n' "Commit or stash tracked changes, or set RELEASE_ALLOW_DIRTY=1 for a development-only rehearsal." >&2
    exit 1
  fi
fi

"${NODE_BIN}" "${NODE_SCRIPT_DIR}/verify-version.mjs" "${VERSION}"
"${PNPM_CMD[@]}" check:boundaries
"${PNPM_CMD[@]}" -r typecheck
"${PNPM_CMD[@]}" -r build

rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}"

declare -a ARCHIVE_NAMES=()

pack_adapter() {
  local host="$1"
  local pack_script="$2"
  local archive_path
  local archive_name

  archive_path="$(bash "${pack_script}" | tail -n 1)"
  if [[ "${archive_path}" =~ ^[A-Za-z]:[\\/].* ]]; then
    if command -v wslpath >/dev/null 2>&1; then
      archive_path="$(wslpath -u "${archive_path}")"
    elif command -v cygpath >/dev/null 2>&1; then
      archive_path="$(cygpath -u "${archive_path}")"
    fi
  fi
  if [[ ! -f "${archive_path}" ]]; then
    printf 'Release archive was not created for %s: %s\n' "${host}" "${archive_path}" >&2
    exit 1
  fi

  archive_name="$(basename "${archive_path}")"
  cp "${archive_path}" "${OUTPUT_DIR}/${archive_name}"
  rm -f "${archive_path}"
  ARCHIVE_NAMES+=("${archive_name}")

  if [[ "${host}" == "openclaw" ]]; then
    "${NODE_BIN}" "${NODE_SCRIPT_DIR}/smoke-openclaw-package.mjs" "${NODE_OUTPUT_DIR}/${archive_name}" "${VERSION}"
  else
    "${NODE_BIN}" "${NODE_SCRIPT_DIR}/smoke-host-package.mjs" "${NODE_OUTPUT_DIR}/${archive_name}" "${host}" "${VERSION}"
  fi
}

pack_adapter "openclaw" "${REPO_ROOT}/components/adapters/openclaw/scripts/pack_release.sh"
pack_adapter "codex" "${REPO_ROOT}/components/adapters/codex/scripts/pack_release.sh"
pack_adapter "claude-code" "${REPO_ROOT}/components/adapters/claude-code/scripts/pack_release.sh"

(
  cd "${OUTPUT_DIR}"
  sha256sum "${ARCHIVE_NAMES[@]}" > SHA256SUMS
)

COMMIT="$("${GIT_BIN}" -C "${GIT_REPO_ROOT}" rev-parse HEAD)"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

"${NODE_BIN}" - "${NODE_OUTPUT_DIR}/release-manifest.json" "${VERSION}" "${COMMIT}" "${BUILT_AT}" "${DIRTY}" "${ARCHIVE_NAMES[@]}" <<'NODE'
const fs = require("node:fs");
const [path, version, commit, builtAt, dirty, ...archives] = process.argv.slice(2);
const packageByFile = {
  openclaw: "@lightrsi/openclaw-adapter",
  codex: "@lightrsi/codex-adapter",
  "claude-code": "@lightrsi/claude-code-adapter",
};
const hostForArchive = (archive) => {
  if (archive.includes("openclaw")) return "openclaw";
  if (archive.includes("claude-code")) return "claude-code";
  if (archive.includes("codex")) return "codex";
  throw new Error(`Unknown adapter archive: ${archive}`);
};
fs.writeFileSync(path, `${JSON.stringify({
  product: "LightRSI",
  version,
  tag: `v${version}`,
  commit,
  builtAt,
  dirty: dirty === "true",
  prerelease: version.includes("-"),
  presets: [{ id: "tokenpilot", version: "1" }],
  artifacts: archives.map((file) => {
    const host = hostForArchive(file);
    return {
      package: packageByFile[host],
      file,
      host,
      ...(host === "openclaw" ? { runtimePluginId: "tokenpilot" } : {}),
    };
  }),
}, null, 2)}\n`);
NODE

OPENCLAW_ARCHIVE="${ARCHIVE_NAMES[0]}"
CODEX_ARCHIVE="${ARCHIVE_NAMES[1]}"
CLAUDE_ARCHIVE="${ARCHIVE_NAMES[2]}"

cat > "${OUTPUT_DIR}/RELEASE_NOTES.md" <<EOF
# LightRSI v${VERSION}

Commit: \`${COMMIT}\`
Dirty worktree: \`${DIRTY}\`

## Presets

- TokenPilot preset v1

## Release Assets

- \`${OPENCLAW_ARCHIVE}\`: bundled OpenClaw adapter with TokenPilot runtime compatibility
- \`${CODEX_ARCHIVE}\`: self-contained Codex adapter, installer, shared CLI, hooks, and recovery MCP
- \`${CLAUDE_ARCHIVE}\`: self-contained Claude Code adapter, installer, shared CLI, hooks, and recovery MCP
- \`SHA256SUMS\`: artifact checksum
- \`release-manifest.json\`: machine-readable release metadata

## Installation Status

- OpenClaw: bundled release artifact available
- Codex: self-contained release artifact available
- Claude Code: self-contained release artifact available

## Compatibility

- OpenClaw plugin id remains \`tokenpilot\`
- existing TokenPilot commands, config names, and state paths remain compatible
- Codex and Claude Code installers preserve the existing \`tokenpilot-*\` host commands

## Known Limitations

- npm packages are not published by this release
- edit this draft before creating a public GitHub Release
EOF

printf 'Local release candidate created: %s\n' "${OUTPUT_DIR}"
for archive_name in "${ARCHIVE_NAMES[@]}"; do
  printf 'Artifact: %s\n' "${OUTPUT_DIR}/${archive_name}"
done
