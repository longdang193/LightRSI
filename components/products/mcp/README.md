# TokenPilot Recovery MCP Product

This package provides the host-neutral `memory_fault_recover` MCP server used by Codex and Claude Code adapters.

The server declares its TokenPilot preset ownership through a shared `ProductRegistration`. It does not register as a host because it only resolves archived artifacts from a supplied `TOKENPILOT_STATE_DIR`.

The package root resolver targets the reorganized source location: `components/products/mcp`. Installed host configurations should point at the built `dist/server.js` entry.

```bash
pnpm --dir components/products/mcp build
pnpm --dir components/products/mcp typecheck
pnpm --dir components/products/mcp test
```

## Recovery modes

`memory_fault_recover` accepts either `artifactRef` from a current reduction notice or legacy `dataKey`.

- Default `range` mode preserves existing behavior. Add `startLine` and `endLine` for a bounded window.
- `stats` returns archive size, line count, available range, and line-number basis without returning content.
- `search` performs literal matching. Pass `query`; optional `contextLines`, `maxMatches`, and `maxOutputChars` keep output bounded.

Example:

```json
{"artifactRef":"artifact:v2:...","mode":"search","query":"invalid token","contextLines":2,"maxMatches":10}
```

Archive-relative line numbers become source-relative only when stored read-window metadata proves the offset. Legacy `dataKey` calls remain supported.
