# Build and Test

Commands for building, typechecking, and testing LightRSI.

## Build

```bash
# Build everything
pnpm build

# Build the CLI specifically
pnpm lightrsi:build
pnpm lightrsi:install

# Build specific adapter
pnpm --dir components/adapters/openclaw run build
pnpm --dir components/adapters/codex run build
pnpm --dir components/adapters/claude-code run build
```

## Typecheck

```bash
# Typecheck all packages
pnpm typecheck

# Typecheck specific package
pnpm --dir components/packages/foundation/runtime-core run typecheck
```

## Test

```bash
# Run all tests
pnpm lightrsi:test

# Run tests for specific package
pnpm --dir components/products/cli test
```

## CI

GitHub Actions workflows are in `.github/workflows/`. The CI runs:
- Typecheck
- Build
- Tests

## Documentation

```bash
pnpm docs:dev      # Dev server with hot reload
pnpm docs:build    # Production build
pnpm docs:preview  # Preview production build
```

## Next

- [Local Development](/development/local-development)
- [Contributing](/development/contributing)
