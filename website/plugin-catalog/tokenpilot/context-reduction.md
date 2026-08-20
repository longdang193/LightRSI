# Context Reduction

Context reduction **trims oversized tool output** before it pollutes later turns. Large tool responses can dominate the context window without adding proportional value.

## Reduction Pipeline

TokenPilot's reduction runs a pipeline of passes on each tool result:

| Pass | Description | Configurable |
| :-- | :-- | :-- |
| `readStateCompaction` | Compact stale or superseded read results before they bloat later context | Yes |
| `toolPayloadTrim` | Trim oversized tool payloads | Yes |
| `htmlSlimming` | Compact noisy HTML content | Yes |
| `execOutputTruncation` | Truncate long execution outputs | Yes |
| `agentsStartupOptimization` | Apply agent startup optimization pass | Yes |

## Controlling Reduction

```bash
# Toggle reduction
lightrsi reduction on
lightrsi reduction off

# Switch mode
lightrsi reduction mode balanced

# Enable/disable specific passes
lightrsi reduction pass toolPayloadTrim off
lightrsi reduction pass toolPayloadTrim on

# Check current status
lightrsi reduction status
```

## Next

- [Context Eviction](/plugin-catalog/tokenpilot/context-eviction) — pruning old context
- [Stable Prefix](/plugin-catalog/tokenpilot/stable-prefix) — cache optimization
- [Reports and Visuals](/plugin-catalog/tokenpilot/reports-and-visuals) — see all metrics
