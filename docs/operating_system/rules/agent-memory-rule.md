---
name: agent-memory
description: Govern conditional use of persistent project memory through MCP Memory Server.
alwaysApply: true
required_reads: []
distribution_tier: starter_kit
---

# Agent Memory Rule

- Use configured MCP Memory Server as persistent agent-memory surface only when active executor exposes it. Under `dcode-project`, Codex handles required memory calls and passes only validated handoff facts; do not create direct DeepAgents MCP configuration or repository-file memory.
- Fetch memory before work only when task touches shared workflows, architecture or publication invariants, resumed work, recurring failures, or high-risk cross-cutting changes.
- Do not fetch memory for isolated, obvious, low-risk edits.
- Store only verified reusable decisions, invariants, failure causes, operational constraints, or lessons costly to rediscover.
- Do not store transient task progress, guesses, secrets, credentials, personal data, raw sensitive source content, or facts already obvious from authoritative sources.
- Use narrow project-prefixed entities and atomic observations. Include supporting source paths when they improve verification.
- Correct or delete stale memory when current source, tests, ADRs, governance, or explicit instructions contradict it.
- Memory informs work; it never overrides explicit instructions, source code, tests, ADRs, or current governance.
- MCP unavailability never blocks safe source-first work. Do not silently fall back to repository memory files.
- Keep memory data and backups outside repository and public exports.
