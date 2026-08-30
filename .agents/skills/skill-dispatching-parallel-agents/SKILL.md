---
name: skill-dispatching-parallel-agents
description: Use when two or more independent investigations or approved implementation lanes can run concurrently without shared state, hidden dependencies, or overlapping write ownership.
required_reads: []
distribution_tier: starter_kit
---

# Dispatching Parallel Agents

## Overview

You delegate tasks to specialized agents with isolated context. By precisely crafting their instructions and context, you ensure they stay focused and succeed at their task. They should never inherit your session's context or history — you construct exactly what they need. This also preserves your own context for coordination work.

When you have multiple unrelated failures (different test files, different subsystems, different bugs), investigating them sequentially wastes time. Each investigation is independent and can happen in parallel.

**Core principle:** Dispatch one agent per independent problem domain. Let them work concurrently.

## Ownership And Connections

- This skill owns fan-out and fan-in for independent investigations and approved concurrent implementation lanes: prove independence, assign exact write ownership, create focused self-contained tasks, dispatch concurrently, review results, integrate, and combine evidence.
- When dispatching subagents, follow the active `Subagent Routing` policy. Select the agent type explicitly and never override its template model or reasoning effort.
- `skill-subagent-driven-development` owns sequential fresh implementers with per-task review in one workspace.
- `skill-executing-plans` owns general approved-plan execution and routes disjoint concurrent lanes here.
- `skill-systematic-debugging` owns root-cause method inside each investigation; do not parallelize failures until shared-cause risk is assessed.
- `skill-using-git-worktrees` provides isolation when concurrent writers need separate workspaces.
- `skill-requesting-code-review` and `skill-receiving-code-review` own review exchange after implementation changes.
- `skill-verification-before-completion` owns fresh final proof after results are integrated.
- With `deepagents`, built-in `task` is one executor-local delegation path. It
  does not make Codex MCP tools or permissions available. Keep same-workspace
  concurrent writers prohibited; parallel writers still need disjoint paths and
  isolated Git worktrees. A read-only task may overlap one writer only when it
  uses immutable inputs and does not inspect changing working-tree state.
  Required MCP calls stay with Codex; pass only validated
  `codex.mcp.handoff.v1` facts to DeepAgents.
- For DeepAgents parallel preflight plus sequential final validation, reuse plan
  waves and task contracts. Parallel wave contains only independent tasks; a
  read-only preflight uses immutable inputs recorded by task `Dependencies` and
  `Files And Symbols`. Final validation is a dependent later-wave task after
  fan-in. Do not run same-workspace final validation concurrently with writer.
  Codex still owns final Git verification and acceptance.

Use this skill directly for independent investigations, audits, research
questions, bounded fixes, or approved multi-lane implementation with disjoint
write ownership.

## Execution Modes

### Read-only fan-out

Independent investigations may run concurrently without an active plan, branch,
or worktree unless the task explicitly requires one. Each lane gets immutable
inputs, a focused question, and a required evidence format.

### Parallel writers

Concurrent implementation lanes require an approved plan, dependency-ready
tasks, isolated Git worktrees, disjoint write ownership, and declared lane
proof. Same-workspace writers remain sequential.
## When to Use

```dot
digraph when_to_use {
    "Multiple failures?" [shape=diamond];
    "Are they independent?" [shape=diamond];
    "Single agent investigates all" [shape=box];
    "One agent per problem domain" [shape=box];
    "Can they work in parallel?" [shape=diamond];
    "Sequential agents" [shape=box];
    "Parallel dispatch" [shape=box];

    "Multiple failures?" -> "Are they independent?" [label="yes"];
    "Are they independent?" -> "Single agent investigates all" [label="no - related"];
    "Are they independent?" -> "Can they work in parallel?" [label="yes"];
    "Can they work in parallel?" -> "Parallel dispatch" [label="yes"];
    "Can they work in parallel?" -> "Sequential agents" [label="no - shared state"];
}
```

**Use when:**
- 3+ test files failing with different root causes
- Multiple subsystems broken independently
- Each problem can be understood without context from others
- No shared state between investigations

**Don't use when:**
- Failures are related (fix one might fix others)
- Need to understand full system state
- Agents would interfere with each other

## The Pattern

### 1. Identify Independent Domains

Group failures by what's broken:
- File A tests: Tool approval flow
- File B tests: Batch completion behavior
- File C tests: Abort functionality

Each domain is independent - fixing tool approval doesn't affect abort tests.

### 2. Create Focused Agent Tasks

Each agent gets:
- **Specific scope:** One test file or subsystem
- **Clear goal:** Make these tests pass
- **Constraints:** Don't change other code
- **Expected output:** Summary of what you found and fixed

### 3. Dispatch in Parallel

For parallel writers, record the dependency-ready wave, branch and isolated
worktree for each writer, exact disjoint write ownership, and required lane
proof in the active plan. Then use the platform-native parallel dispatch
facility. Issue all independent spawn calls in the same round when supported;
dispatching one and waiting before the next is sequential.

```text
Subagent: "Fix agent-tool-abort.test.ts failures"
Subagent: "Fix batch-completion-behavior.test.ts failures"
Subagent: "Fix tool-approval-race-conditions.test.ts failures"
# Start all three before waiting for results.
```

If the platform has no concurrent agent support, run lanes sequentially and report that limitation. Do not simulate parallelism with overlapping edits in one workspace.

### 4. Review and Integrate

When agents return:
- Read each summary
- inspect each lane's Git state and diff
- verify declared lane proof
- accept or reject each lane
- integrate only through authorized Git actions
- run the combined verification declared by the plan
- let the lead update plan state after accepted fan-in

## Agent Prompt Structure

Good agent prompts are:
1. **Focused** - One clear problem domain
2. **Self-contained** - All context needed to understand the problem
3. **Specific about output** - What should the agent return?

```markdown
Fix the 3 failing tests in src/agents/agent-tool-abort.test.ts:

1. "should abort tool with partial output capture" - expects 'interrupted at' in message
2. "should handle mixed completed and aborted tools" - fast tool aborted instead of completed
3. "should properly track pendingToolCount" - expects 3 results but gets 0

These are timing/race condition issues. Your task:

1. Read the test file and understand what each test verifies
2. Identify root cause - timing issues or actual bugs?
3. Fix by:
   - Replacing arbitrary timeouts with event-based waiting
   - Fixing bugs in abort implementation if found
   - Adjusting test expectations if testing changed behavior

Do NOT just increase timeouts - find the real issue.

Return: Summary of what you found and what you fixed.
```

## Common Mistakes

**❌ Too broad:** "Fix all the tests" - agent gets lost
**✅ Specific:** "Fix agent-tool-abort.test.ts" - focused scope

**❌ No context:** "Fix the race condition" - agent doesn't know where
**✅ Context:** Paste the error messages and test names

**❌ No constraints:** Agent might refactor everything
**✅ Constraints:** "Do NOT change production code" or "Fix tests only"

**❌ Vague output:** "Fix it" - you don't know what changed
**✅ Specific:** "Return summary of root cause and changes"

## When NOT to Use

**Related failures:** Fixing one might fix others - investigate together first
**Need full context:** Understanding requires seeing entire system
**Exploratory debugging:** You don't know what's broken yet
**Shared state:** Agents would interfere (editing same files, using same resources)

## Real Example from Session

**Scenario:** 6 test failures across 3 files after major refactoring

**Failures:**
- agent-tool-abort.test.ts: 3 failures (timing issues)
- batch-completion-behavior.test.ts: 2 failures (tools not executing)
- tool-approval-race-conditions.test.ts: 1 failure (execution count = 0)

**Decision:** Independent domains - abort logic separate from batch completion separate from race conditions

**Dispatch:**
```
Agent 1 → Fix agent-tool-abort.test.ts
Agent 2 → Fix batch-completion-behavior.test.ts
Agent 3 → Fix tool-approval-race-conditions.test.ts
```

**Results:**
- Agent 1: Replaced timeouts with event-based waiting
- Agent 2: Fixed event structure bug (threadId in wrong place)
- Agent 3: Added wait for async tool execution to complete

**Integration:** All fixes independent, no conflicts, full suite green

**Time saved:** 3 problems solved in parallel vs sequentially

## Key Benefits

1. **Parallelization** - Multiple investigations happen simultaneously
2. **Focus** - Each agent has narrow scope, less context to track
3. **Independence** - Agents don't interfere with each other
4. **Speed** - 3 problems solved in time of 1

## Verification

After agents return:
1. **Review each summary** - Understand what changed
2. **Check for conflicts** - Did agents edit same code?
3. **Run full suite** - Verify all fixes work together
4. **Spot check** - Agents can make systematic errors

## Real-World Impact

From debugging session (2025-10-03):
- 6 failures across 3 files
- 3 agents dispatched in parallel
- All investigations completed concurrently
- All fixes integrated successfully
- Zero conflicts between agent changes
