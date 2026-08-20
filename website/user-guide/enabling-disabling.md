# Enabling and Disabling Plugins

Plugins can be enabled and disabled at runtime without uninstalling them.

## Enable a Plugin

```bash
# Per host
lightrsi openclaw plugin tokenpilot enable
lightrsi codex plugin tokenpilot enable
lightrsi claude-code plugin tokenpilot enable
```

The plugin starts processing on the next turn.

## Disable a Plugin

```bash
lightrsi openclaw plugin tokenpilot disable
lightrsi codex plugin tokenpilot disable
lightrsi claude-code plugin tokenpilot disable
```

The plugin stops processing immediately. Current session state is preserved.

## Master Toggle (TokenPilot)

TokenPilot also supports a quick global toggle:

```bash
lightrsi stabilizer off      # Disable stable prefix only
lightrsi reduction off       # Disable reduction only
lightrsi eviction off        # Disable eviction only
```

To disable TokenPilot entirely, turn off all three subsystems.

## When to Disable

- **Debugging unexpected model behavior**: Rule out plugin interference
- **Short sessions**: Plugin overhead may not justify the savings
- **Testing**: Compare with/without TokenPilot

## Check Current State

```bash
lightrsi status
```

Shows which plugins are enabled and their current mode.

## Next

- [Plugin Configuration](/user-guide/plugin-configuration) — per-plugin settings
- [Sessions](/user-guide/sessions) — session management
