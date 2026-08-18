# Plugin Configuration

Each plugin exposes configuration that can be tuned for your needs.

## Changing Configuration

### Via CLI

```bash
# Mode presets
lightrsi mode conservative
lightrsi mode normal
lightrsi mode aggressive

# Individual settings
lightrsi stabilizer target developer
lightrsi reduction mode balanced
lightrsi eviction on
```

### Via Config File

Edit the plugin config file directly:

```bash
# OpenClaw: ~/.openclaw/openclaw.json
# Codex:    ~/.codex/tokenpilot.json
# Claude:   ~/.claude/tokenpilot.json
```

## Next

- [TokenPilot Configuration](/plugin-catalog/tokenpilot/configuration) — TokenPilot-specific settings
- [Configuration Model](/platform-concepts/configuration-model) — platform-level config
