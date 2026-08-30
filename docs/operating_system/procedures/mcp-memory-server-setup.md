# MCP Memory Server Setup

Use official `@modelcontextprotocol/server-memory` as local persistent agent memory.

## Codex On Windows

Create durable local folder outside repository, then add this to `%USERPROFILE%\.codex\config.toml`:

```toml
[mcp_servers.memory]
command = "cmd"
args = ["/c", "npx", "-y", "@modelcontextprotocol/server-memory"]
startup_timeout_sec = 120

[mcp_servers.memory.env]
MEMORY_FILE_PATH = 'C:\Users\<user>\.codex\memory\<project>-memory.json'
```

Restart Codex after changing MCP configuration.

## Smoke Test

1. Confirm memory tools appear after restart.
2. Create temporary entity.
3. Search for and open it.
4. Delete it.
5. Confirm no temporary entity remains.

## Backup And Removal

Back up `MEMORY_FILE_PATH` like any other private local data. Never commit memory data or backups.

To remove server, delete `[mcp_servers.memory]` and `[mcp_servers.memory.env]` from client configuration, restart client, then archive or delete local memory file as intended.

This starter configures Memory in Codex only. For DeepAgents work, Codex handles
required memory calls and passes validated handoff facts; do not add a direct
DeepAgents MCP configuration.
