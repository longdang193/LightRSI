# Runtime API

The shared packages under `components/packages/` provide host-agnostic runtime logic:

| Package | Description |
| :-- | :-- |
| `kernel/` | Shared contracts, events, and runtime-facing types |
| `runtime-core/` | Host-agnostic runtime engine and reduction pipeline |
| `foundation/history/` | Canonical state, anchors, lifecycle bookkeeping |
| `features/reduction/` and `features/eviction/` | Reduction and eviction policy logic |
| `features/memory/` | Experimental memory layer (distillation and retrieval still in progress) |
| `foundation/host-adapter/` | Shared host contracts and path-resolution interfaces |
| `foundation/product-surface/` | Shared user-facing command actions and product semantics |

These are the actual packages in the repository.

## Related Pages

- [Plugin Directory Structure](/plugin-development/directory-structure) — where each package lives
- [Host-Independent Design](/plugin-development/host-independent-design) — the architectural rationale
