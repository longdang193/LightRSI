# Adapter Testing

From [CONTRIBUTING.md](https://github.com/zjunlp/LightRSI/blob/main/CONTRIBUTING.md) and the [Adapter Playbook](https://github.com/zjunlp/LightRSI/blob/main/docs/adapter-playbook.md):

### Type Check

```bash
pnpm typecheck
```

### Adapter Tests

```bash
# OpenClaw adapter
pnpm --dir components/adapters/openclaw test

# Codex adapter
pnpm --dir components/adapters/codex test

# Claude Code adapter
pnpm --dir components/adapters/claude-code test
```

### Doctor Self-Check

Each adapter provides a `doctor` command for runtime self-verification:

```bash
lightrsi <host> doctor
```

Or per-adapter:

```bash
pnpm --dir components/adapters/openclaw run doctor:openclaw
pnpm --dir components/adapters/codex run doctor:codex
pnpm --dir components/adapters/claude-code run doctor:claude-code
```

Test directories exist at `adapters/<host>/tests/`.

## Related Pages

- [Adapter Architecture](./adapter-architecture.md)
- [Adding a New Host](./adding-new-host.md)
- [Adapter Playbook](https://github.com/zjunlp/LightRSI/blob/main/docs/adapter-playbook.md)
