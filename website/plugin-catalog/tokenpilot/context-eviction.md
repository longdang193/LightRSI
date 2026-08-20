# Context Eviction

Context eviction provides **lifecycle-aware pruning** of old context in longer shared-session workflows.

Note: Eviction is currently only available on OpenClaw (not Codex or Claude Code).

## Mode Thresholds

| Mode | Eviction | Threshold |
| :-- | :-- | :-- |
| Conservative | Off | N/A |
| Normal | Off | N/A |
| Aggressive | On | Lower (evicts sooner) |

## Controlling Eviction

```bash
# Toggle eviction
lightrsi eviction on
lightrsi eviction off

# In OpenClaw
/lightrsi eviction on
```

## Next

- [Stable Prefix](/plugin-catalog/tokenpilot/stable-prefix) — cache optimization
- [Context Reduction](/plugin-catalog/tokenpilot/context-reduction) — trimming tool output
- [Reports and Visuals](/plugin-catalog/tokenpilot/reports-and-visuals) — see all metrics
