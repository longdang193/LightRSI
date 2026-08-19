#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PLUGIN_DIR}"

rm -f lightmem2-openclaw-adapter-*.tgz lightmem2-tokenpilot-openclaw-*.tgz tokenpilot-*.tgz
npm run build >/dev/null 2>&1

NPM_CACHE_DIR="${NPM_CACHE_DIR:-/tmp/tokenpilot-npm-cache}"
mkdir -p "${NPM_CACHE_DIR}"

mkdir -p "${PLUGIN_DIR}/.tmp"
PACK_TMP_DIR="$(mktemp -d "${PLUGIN_DIR}/.tmp/tokenpilot-pack-XXXXXX")"
cleanup() {
  rm -rf "${PACK_TMP_DIR}"
}
trap cleanup EXIT

mkdir -p "${PACK_TMP_DIR}/package"
cp -R dist "${PACK_TMP_DIR}/package/dist"
cp README.md "${PACK_TMP_DIR}/package/README.md"
cp openclaw.plugin.json "${PACK_TMP_DIR}/package/openclaw.plugin.json"

python3 - "${PLUGIN_DIR}/package.json" "${PACK_TMP_DIR}/package/package.json" <<'PY'
import json
import sys
from pathlib import Path

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
pkg = json.loads(src.read_text(encoding="utf-8"))

# Release tarball is fully bundled in dist/index.js. Workspace deps make
# OpenClaw try to npm install inside the extracted plugin directory, which
# fails outside the monorepo. Strip runtime/dev deps for the packed artifact.
pkg.pop("dependencies", None)
pkg.pop("devDependencies", None)
pkg.pop("scripts", None)

dst.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
PY

cd "${PACK_TMP_DIR}/package"
npm_config_cache="${NPM_CACHE_DIR}" npm pack >/dev/null
archive_path="$(find "${PACK_TMP_DIR}/package" -maxdepth 1 -type f -name '*.tgz' -print -quit)"
if [[ -z "${archive_path}" ]]; then
  echo "npm pack produced no archive" >&2
  exit 1
fi
archive_name="$(basename "${archive_path}")"
cp "${archive_path}" "${PLUGIN_DIR}/${archive_name}"
archive_path="${PLUGIN_DIR}/${archive_name}"

if command -v wslpath >/dev/null 2>&1; then
  printf '%s\n' "$(wslpath -w "${archive_path}")"
elif command -v cygpath >/dev/null 2>&1; then
  printf '%s\n' "$(cygpath -w "${archive_path}")"
else
  printf '%s\n' "${archive_path}"
fi
