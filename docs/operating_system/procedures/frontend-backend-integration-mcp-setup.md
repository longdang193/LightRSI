# Context7 MCP Setup

Context7 supplies current external-library documentation. It never owns repository behavior, architecture, contracts, tests, or runtime truth.

## Codex Configuration

Add to `%USERPROFILE%\.codex\config.toml`:

```toml
[mcp_servers.context7]
url = "https://mcp.context7.com/mcp"
```

Requirements:

- restart Codex after changing configuration
- keep optional API keys in private client configuration or environment variables

Do not commit client configuration, credentials, caches, or generated MCP state.
This procedure configures Codex only. For DeepAgents work, Codex supplies
validated handoff facts; do not add direct DeepAgents MCP configuration.

## Smoke Tests

### Context7

1. Resolve one dependency already pinned by current project.
2. Request documentation for pinned major/minor version.
3. Confirm returned guidance matches dependency version.

## Fallback

When Context7 is unavailable, continue with pinned local documentation, canonical contracts, source, tests, and existing project tooling. Do not create duplicate schemas or documentation layers.

## Removal

Delete `[mcp_servers.context7]` from private Codex configuration, then restart Codex. Remove private cache separately when no longer needed.
