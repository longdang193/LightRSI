import test from "node:test";
import assert from "node:assert/strict";

import type { ContextSegment, RuntimeTurnContext, RuntimeTurnResult } from "@lightrsi/kernel";
import { classifyReadStates } from "../src/reduction/read-state-compaction.js";
import { readStateCompactionPass } from "../src/passes/pass-read-state-compaction.js";
import { resolveReductionPasses, runReductionAfterCall, runReductionBeforeCall } from "../src/reduction/pipeline.js";

function buildSegment(
  id: string,
  toolName: string,
  path: string,
  text: string,
  fieldName?: string,
  readWindow?: { offset?: number; limit?: number },
): ContextSegment {
  return {
    id,
    kind: "volatile",
    priority: 1,
    text,
    metadata: {
      toolName,
      path,
      ...(fieldName ? { fieldName } : {}),
      ...(readWindow ? { readWindow } : {}),
      toolPayload: {
        toolName,
        path,
        ...(readWindow ? { readWindow } : {}),
      },
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

test("classifyReadStates marks latest untouched read as fresh", () => {
  const states = classifyReadStates([
    buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;", "output"),
  ]);

  assert.equal(states.get("read-1-output"), "fresh");
});

test("classifyReadStates marks earlier read as superseded when re-read later", () => {
  const states = classifyReadStates([
    buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;", "output"),
    buildSegment("read-2-output", "read", "/repo/a.ts", "const a = 1;\nconst b = 2;", "output"),
  ]);

  assert.equal(states.get("read-1-output"), "superseded");
  assert.equal(states.get("read-2-output"), "fresh");
});

test("classifyReadStates does not mark different read windows as superseded", () => {
  const states = classifyReadStates([
    buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;", "output", { offset: 1, limit: 200 }),
    buildSegment("read-2-output", "read", "/repo/a.ts", "const z = 26;", "output", { offset: 201, limit: 200 }),
  ]);

  assert.equal(states.get("read-1-output"), "fresh");
  assert.equal(states.get("read-2-output"), "fresh");
});

test("classifyReadStates preserves explicit offset zero in read identity", () => {
  const states = classifyReadStates([
    buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;", "output", { offset: 0, limit: 200 }),
    buildSegment("read-2-output", "read", "/repo/a.ts", "const b = 2;", "output", { offset: 200, limit: 200 }),
  ]);

  assert.equal(states.get("read-1-output"), "fresh");
  assert.equal(states.get("read-2-output"), "fresh");
});

test("classifyReadStates marks read as stale when file is edited later", () => {
  const states = classifyReadStates([
    buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;", "output"),
    buildSegment("edit-1-arguments", "edit", "/repo/a.ts", "{\"replace\":\"1\",\"with\":\"2\"}", "arguments"),
  ]);

  assert.equal(states.get("read-1-output"), "stale");
});

test("classifyReadStates ignores non-output read argument segments", () => {
  const states = classifyReadStates([
    buildSegment("read-1-arguments", "read", "/repo/a.ts", "{\"path\":\"/repo/a.ts\"}", "arguments"),
    buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;", "output"),
  ]);

  assert.equal(states.has("read-1-arguments"), false);
  assert.equal(states.get("read-1-output"), "fresh");
});

test("runReductionBeforeCall restores nested context after pass failure", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "failure-session",
    sessionMode: "single",
    provider: "test",
    model: "test-model",
    apiFamily: "other",
    prompt: "test",
    budget: { maxInputTokens: 0, reserveOutputTokens: 0 },
    segments: [buildSegment("segment-1", "read", "/repo/a.ts", "original", "output")],
    metadata: { nested: { value: "original" } },
  };
  const result = await runReductionBeforeCall({
    turnCtx,
    passes: [{ id: "throwing_pass", phase: "before_call", target: "context_segment" }],
    registry: {
      throwing_pass: {
        beforeCall({ turnCtx: current }) {
          (current.metadata as any).nested.value = "mutated";
          (current.segments[0]!.metadata as any).nested = "mutated";
          throw new Error("fixture failure");
        },
      },
    },
  });

  assert.equal((result.turnCtx.metadata as any).nested.value, "original");
  assert.equal((result.turnCtx.segments[0]!.metadata as any).nested, undefined);
  assert.equal(result.report[0]?.skippedReason, "pass_error");
  assert.equal(typeof result.report[0]?.durationMs, "number");
});

test("runReductionBeforeCall publishes successful legacy mutations even when changed is false", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "legacy-before-success-session",
    sessionMode: "single",
    provider: "test",
    model: "test-model",
    apiFamily: "other",
    prompt: "test",
    budget: { maxInputTokens: 0, reserveOutputTokens: 0 },
    segments: [buildSegment("segment-1", "read", "/repo/a.ts", "original", "output")],
    metadata: { nested: { value: "original" } },
  };
  const result = await runReductionBeforeCall({
    turnCtx,
    passes: [{ id: "legacy_before_success", phase: "before_call", target: "context_segment" }],
    registry: {
      legacy_before_success: {
        beforeCall({ turnCtx: current }) {
          current.segments[0]!.text = "mutated";
          (current.metadata as any).nested.value = "published";
          return { changed: false };
        },
      },
    },
  });

  assert.equal(result.turnCtx.segments[0]?.text, "mutated");
  assert.equal((result.turnCtx.metadata as any).nested.value, "published");
  assert.equal(turnCtx.segments[0]?.text, "original");
  assert.equal((turnCtx.metadata as any).nested.value, "original");
  assert.equal(result.report[0]?.changed, false);
});

test("runReductionBeforeCall publishes legacy mutations without mutating input", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "legacy-session",
    sessionMode: "single",
    provider: "test",
    model: "test-model",
    apiFamily: "other",
    prompt: "test",
    budget: { maxInputTokens: 0, reserveOutputTokens: 0 },
    segments: [buildSegment("segment-1", "read", "/repo/a.ts", "original", "output")],
  };

  const result = await runReductionBeforeCall({
    turnCtx,
    passes: [{ id: "legacy_pass", phase: "before_call", target: "context_segment" }],
    registry: {
      legacy_pass: {
        beforeCall({ turnCtx: current }) {
          current.segments[0]!.text = "mutated";
          return { changed: true };
        },
      },
    },
  });

  assert.equal(result.turnCtx.segments[0]!.text, "mutated");
  assert.equal(turnCtx.segments[0]!.text, "original");
  assert.equal(result.report[0]?.changed, true);
});

test("runReductionBeforeCall ignores immutableInput on custom handlers", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "custom-session",
    sessionMode: "single",
    provider: "test",
    model: "test-model",
    apiFamily: "other",
    prompt: "test",
    budget: { maxInputTokens: 0, reserveOutputTokens: 0 },
    segments: [buildSegment("segment-1", "read", "/repo/a.ts", "original", "output")],
  };

  const result = await runReductionBeforeCall({
    turnCtx,
    passes: [{ id: "custom_pass", phase: "before_call", target: "context_segment" }],
    registry: {
      custom_pass: {
        immutableInput: true,
        beforeCall({ turnCtx: current }) {
          current.segments[0]!.text = "mutated";
          throw new Error("fixture failure");
        },
      },
    },
  });

  assert.equal(result.turnCtx.segments[0]!.text, "original");
  assert.equal(result.report[0]?.skippedReason, "pass_error");
});

test("runReductionBeforeCall isolates request-state segment aliases on failure", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "request-state-alias-session",
    sessionMode: "single",
    provider: "test",
    model: "test-model",
    apiFamily: "other",
    prompt: "test",
    budget: { maxInputTokens: 0, reserveOutputTokens: 0 },
    segments: [buildSegment("segment-1", "read", "/repo/a.ts", "original", "output")],
  };

  const result = await runReductionBeforeCall({
    turnCtx,
    passes: [
      { id: "alias_throwing_pass", phase: "before_call", target: "context_segment" },
      { id: "alias_observer_pass", phase: "before_call", target: "context_segment" },
    ],
    registry: {
      alias_throwing_pass: {
        beforeCall({ requestState }) {
          const segment = requestState?.segmentIndex?.get("segment-1") as any;
          segment.text = "leaked";
          throw new Error("fixture failure");
        },
      },
      alias_observer_pass: {
        beforeCall({ turnCtx: current }) {
          assert.equal(current.segments[0]?.text, "original");
          return { changed: false };
        },
      },
    },
  });

  assert.equal(result.turnCtx.segments[0]?.text, "original");
  assert.equal(turnCtx.segments[0]?.text, "original");
  assert.equal(result.report[0]?.skippedReason, "pass_error");
});

test("runReductionBeforeCall keeps accepted state isolated after a prior publication", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "request-state-publication-session",
    sessionMode: "single",
    provider: "test",
    model: "test-model",
    apiFamily: "other",
    prompt: "test",
    budget: { maxInputTokens: 0, reserveOutputTokens: 0 },
    segments: [buildSegment("segment-1", "read", "/repo/a.ts", "original", "output")],
  };

  const result = await runReductionBeforeCall({
    turnCtx,
    passes: [
      { id: "publishing_pass", phase: "before_call", target: "context_segment" },
      { id: "published_alias_throwing_pass", phase: "before_call", target: "context_segment" },
      { id: "published_alias_observer_pass", phase: "before_call", target: "context_segment" },
    ],
    registry: {
      publishing_pass: {
        beforeCall({ turnCtx: current }) {
          current.segments[0]!.text = "published";
          return { changed: true };
        },
      },
      published_alias_throwing_pass: {
        beforeCall({ requestState }) {
          const segment = requestState?.segmentIndex?.get("segment-1") as any;
          segment.text = "leaked";
          throw new Error("fixture failure");
        },
      },
      published_alias_observer_pass: {
        beforeCall({ turnCtx: current }) {
          assert.equal(current.segments[0]?.text, "published");
          return { changed: false };
        },
      },
    },
  });

  assert.equal(result.turnCtx.segments[0]?.text, "published");
  assert.equal(result.report[1]?.skippedReason, "pass_error");
});

test("runReductionBeforeCall does not import classifications from another execution", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "request-state-fresh-session",
    sessionMode: "single",
    provider: "test",
    model: "test-model",
    apiFamily: "other",
    prompt: "test",
    budget: { maxInputTokens: 0, reserveOutputTokens: 0 },
    segments: [buildSegment("segment-1", "read", "/repo/a.ts", "original", "output")],
  };
  const requestState: any = {
    readStateClassifications: new Map([["stale", { state: "stale" }]]),
  };

  await runReductionBeforeCall({
    turnCtx,
    requestState,
    passes: [{ id: "fresh_state_probe", phase: "before_call", target: "context_segment" }],
    registry: {
      fresh_state_probe: {
        beforeCall({ requestState: current }) {
          assert.equal(current?.readStateClassifications?.has("stale"), false);
          return { changed: false };
        },
      },
    },
  });
});

test("runReductionBeforeCall invalidates classifications after a changed-false structural pass", async () => {
  const readSegments = [
    buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;", "output"),
    buildSegment("read-2-output", "read", "/repo/a.ts", "const b = 2;", "output"),
  ];
  const turnCtx: RuntimeTurnContext = {
    sessionId: "classification-invalidation-session",
    sessionMode: "single",
    provider: "test",
    model: "test-model",
    apiFamily: "other",
    prompt: "test",
    budget: { maxInputTokens: 0, reserveOutputTokens: 0 },
    segments: readSegments,
    metadata: {
      policy: {
        decisions: {
          reduction: {
            instructions: [{ strategy: "read_state_compaction", segmentIds: readSegments.map((segment) => segment.id) }],
          },
        },
      },
    },
  };

  await runReductionBeforeCall({
    turnCtx,
    passes: [
      { id: "read_state_compaction", phase: "before_call", target: "context_segment" },
      { id: "structural_changed_false_pass", phase: "before_call", target: "context_segment" },
      { id: "classification_probe", phase: "before_call", target: "context_segment" },
    ],
    registry: {
      structural_changed_false_pass: {
        beforeCall({ turnCtx: current }) {
          return {
            changed: false,
            turnCtx: {
              ...current,
              segments: current.segments.map((segment, index) => index === 0
                ? { ...segment, metadata: { ...segment.metadata, toolName: "edit" } }
                : segment),
            },
          };
        },
      },
      classification_probe: {
        beforeCall({ requestState: current }) {
          assert.equal(current?.readStateClassifications?.size ?? 0, 0);
          return { changed: false };
        },
      },
    },
  });
});

test("runReductionAfterCall restores nested context after pass failure", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "after-call-failure-session",
    sessionMode: "single",
    provider: "test",
    model: "test-model",
    apiFamily: "other",
    prompt: "test",
    budget: { maxInputTokens: 0, reserveOutputTokens: 0 },
    segments: [buildSegment("segment-1", "read", "/repo/a.ts", "original", "output")],
    metadata: { nested: { value: "original" } },
  };
  const result: RuntimeTurnResult = { content: "original result" };
  const reduced = await runReductionAfterCall({
    turnCtx,
    result,
    passes: [{ id: "throwing_after_call", phase: "after_call", target: "result_content" }],
    registry: {
      throwing_after_call: {
        afterCall({ turnCtx: current }) {
          (current.metadata as any).nested.value = "mutated";
          (current.segments[0]!.metadata as any).nested = "mutated";
          throw new Error("fixture failure");
        },
      },
    },
  });

  assert.equal((turnCtx.metadata as any).nested.value, "original");
  assert.equal((turnCtx.segments[0]!.metadata as any).nested, undefined);
  assert.deepEqual(reduced.result, result);
  assert.equal(reduced.report[0]?.skippedReason, "pass_error");
  assert.equal(typeof reduced.report[0]?.durationMs, "number");
});

test("runReductionAfterCall publishes successful legacy result and context mutations", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "legacy-after-success-session",
    sessionMode: "single",
    provider: "test",
    model: "test-model",
    apiFamily: "other",
    prompt: "test",
    budget: { maxInputTokens: 0, reserveOutputTokens: 0 },
    segments: [buildSegment("segment-1", "read", "/repo/a.ts", "original", "output")],
    metadata: { nested: { value: "original" } },
  };
  const reduced = await runReductionAfterCall({
    turnCtx,
    result: { content: "original result" },
    passes: [{ id: "legacy_after_success", phase: "after_call", target: "result_content" }],
    registry: {
      legacy_after_success: {
        afterCall({ turnCtx: currentCtx, currentResult }) {
          (currentCtx.metadata as any).nested.value = "published";
          currentResult.content = "mutated result";
          return { changed: false };
        },
      },
    },
  });

  assert.equal(reduced.result.content, "mutated result");
  assert.equal((turnCtx.metadata as any).nested.value, "published");
  assert.equal(reduced.report[0]?.changed, false);
});

test("immutable read-state pass accepts recursively frozen input", async () => {
  const turnCtx = deepFreeze<RuntimeTurnContext>({
    sessionId: "immutable-input-session",
    sessionMode: "single",
    provider: "test",
    model: "test-model",
    apiFamily: "other",
    prompt: "",
    budget: { maxInputTokens: 100000, reserveOutputTokens: 1000 },
    segments: [
      buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;\n".repeat(100), "output"),
      buildSegment("read-2-output", "read", "/repo/a.ts", "const a = 2;\n", "output"),
    ],
    metadata: {
      workspaceDir: "/tmp",
      policy: {
        decisions: {
          reduction: {
            instructions: [{ strategy: "read_state_compaction", segmentIds: ["read-1-output"] }],
          },
        },
      },
    },
  });

  const result = await readStateCompactionPass.beforeCall?.({
    turnCtx,
    spec: {
      id: "read_state_compaction",
      phase: "before_call",
      target: "context_segment",
      options: { archiveDir: "/tmp/lightrsi-immutable-test" },
    },
  });

  assert.equal(result?.changed, true);
  assert.equal(result?.turnCtx?.segments[0]?.text.includes("[Read superseded]"), true);
});

test("readStateCompactionPass replaces superseded reads with state stub", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "test-session",
    sessionMode: "single",
    provider: "test",
    model: "test",
    prompt: "",
    budget: {
      maxInputTokens: 100000,
      reserveOutputTokens: 1000,
    },
    segments: [
      buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;\n".repeat(200), "output"),
      buildSegment("read-2-output", "read", "/repo/a.ts", "const a = 2;\n".repeat(80), "output"),
    ],
    metadata: {
      workspaceDir: "/tmp",
      policy: {
        decisions: {
          reduction: {
            instructions: [
              {
                strategy: "read_state_compaction",
                segmentIds: ["read-1-output"],
              },
            ],
          },
        },
      },
    },
  };

  const result = await readStateCompactionPass.beforeCall?.({
    turnCtx,
    spec: {
      id: "read_state_compaction",
      phase: "before_call",
      target: "context_segment",
      options: {},
    },
  });

  assert.ok(result);
  assert.equal(result?.changed, true);
  assert.deepEqual(result?.touchedSegmentIds, ["read-1-output"]);
  const updated = result?.turnCtx?.segments.find((segment) => segment.id === "read-1-output");
  assert.ok(updated);
  assert.match(updated?.text ?? "", /\[Read superseded\]/);
  assert.match(updated?.text ?? "", /memory_fault_recover/);
  assert.match(updated?.text ?? "", /"artifactRef":"artifact:v2:/);
  assert.equal(
    ((updated?.metadata as Record<string, unknown> | undefined)?.recovery as Record<string, unknown> | undefined)?.skipReduction,
    true,
  );
});

test("readStateCompactionPass replaces stale reads with state stub", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "test-session",
    sessionMode: "single",
    provider: "test",
    model: "test",
    prompt: "",
    budget: {
      maxInputTokens: 100000,
      reserveOutputTokens: 1000,
    },
    segments: [
      buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;\n".repeat(200), "output"),
      buildSegment("edit-1-arguments", "edit", "/repo/a.ts", "{\"replace\":\"1\",\"with\":\"2\"}", "arguments"),
    ],
    metadata: {
      workspaceDir: "/tmp",
      policy: {
        decisions: {
          reduction: {
            instructions: [
              {
                strategy: "read_state_compaction",
                segmentIds: ["read-1-output"],
              },
            ],
          },
        },
      },
    },
  };

  const result = await readStateCompactionPass.beforeCall?.({
    turnCtx,
    spec: {
      id: "read_state_compaction",
      phase: "before_call",
      target: "context_segment",
      options: {},
    },
  });

  assert.ok(result);
  assert.equal(result?.changed, true);
  assert.deepEqual(result?.touchedSegmentIds, ["read-1-output"]);
  const updated = result?.turnCtx?.segments.find((segment) => segment.id === "read-1-output");
  assert.ok(updated);
  assert.match(updated?.text ?? "", /\[Read stale\]/);
  assert.match(updated?.text ?? "", /modified later/);
  assert.equal(
    ((updated?.metadata as Record<string, unknown> | undefined)?.recovery as Record<string, unknown> | undefined)?.skipReduction,
    true,
  );
});

test("readStateCompactionPass leaves fresh reads untouched", async () => {
  const original = "const a = 1;\n".repeat(20);
  const turnCtx: RuntimeTurnContext = {
    sessionId: "test-session",
    sessionMode: "single",
    provider: "test",
    model: "test",
    prompt: "",
    budget: {
      maxInputTokens: 100000,
      reserveOutputTokens: 1000,
    },
    segments: [
      buildSegment("read-1-output", "read", "/repo/a.ts", original, "output"),
    ],
  };

  const result = await readStateCompactionPass.beforeCall?.({
    turnCtx,
    spec: {
      id: "read_state_compaction",
      phase: "before_call",
      target: "context_segment",
      options: {},
    },
  });

  assert.ok(result);
  assert.equal(result?.changed, false);
  assert.equal(result?.skippedReason, "no_policy_instructions");
});

test("readStateCompactionPass skips when policy does not nominate segments", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "test-session",
    sessionMode: "single",
    provider: "test",
    model: "test",
    prompt: "",
    budget: {
      maxInputTokens: 100000,
      reserveOutputTokens: 1000,
    },
    segments: [
      buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;\n".repeat(200), "output"),
      buildSegment("edit-1-arguments", "edit", "/repo/a.ts", "{\"replace\":\"1\",\"with\":\"2\"}", "arguments"),
    ],
    metadata: {
      workspaceDir: "/tmp",
      policy: {
        decisions: {
          reduction: {
            instructions: [],
          },
        },
      },
    },
  };

  const result = await readStateCompactionPass.beforeCall?.({
    turnCtx,
    spec: {
      id: "read_state_compaction",
      phase: "before_call",
      target: "context_segment",
      options: {},
    },
  });

  assert.ok(result);
  assert.equal(result?.changed, false);
  assert.equal(result?.skippedReason, "no_policy_instructions");
});

test("resolveReductionPasses includes read_state_compaction before tool_payload_trim", () => {
  const passes = resolveReductionPasses();
  const compactionIndex = passes.findIndex((pass) => pass.id === "read_state_compaction");
  const trimIndex = passes.findIndex((pass) => pass.id === "tool_payload_trim");
  assert.ok(compactionIndex >= 0);
  assert.ok(trimIndex >= 0);
  assert.ok(compactionIndex < trimIndex);
});

test("runReductionBeforeCall executes read_state_compaction and rewrites stale reads", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "test-session",
    sessionMode: "single",
    provider: "test",
    model: "test",
    prompt: "",
    budget: {
      maxInputTokens: 100000,
      reserveOutputTokens: 1000,
    },
    segments: [
      buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;\n".repeat(200), "output"),
      buildSegment("edit-1-arguments", "edit", "/repo/a.ts", "{\"replace\":\"1\",\"with\":\"2\"}", "arguments"),
    ],
    metadata: {
      workspaceDir: "/tmp",
      policy: {
        decisions: {
          reduction: {
            instructions: [
              {
                strategy: "read_state_compaction",
                segmentIds: ["read-1-output"],
              },
            ],
          },
        },
      },
    },
  };

  const passes = resolveReductionPasses({
    passes: [
      {
        id: "read_state_compaction",
        phase: "before_call",
        target: "context_segment",
        options: {},
      },
    ],
  });

  const result = await runReductionBeforeCall({
    turnCtx,
    passes,
  });

  const updated = result.turnCtx.segments.find((segment) => segment.id === "read-1-output");
  assert.ok(updated);
  assert.match(updated?.text ?? "", /\[Read stale\]/);
  assert.equal(result.report.length, 1);
  assert.equal(result.report[0]?.id, "read_state_compaction");
  assert.equal(result.report[0]?.changed, true);
});

test("runReductionBeforeCall leaves non-nominated stale reads untouched", async () => {
  const original = "const a = 1;\n".repeat(200);
  const turnCtx: RuntimeTurnContext = {
    sessionId: "test-session",
    sessionMode: "single",
    provider: "test",
    model: "test",
    prompt: "",
    budget: {
      maxInputTokens: 100000,
      reserveOutputTokens: 1000,
    },
    segments: [
      buildSegment("read-1-output", "read", "/repo/a.ts", original, "output"),
      buildSegment("edit-1-arguments", "edit", "/repo/a.ts", "{\"replace\":\"1\",\"with\":\"2\"}", "arguments"),
    ],
    metadata: {
      workspaceDir: "/tmp",
      policy: {
        decisions: {
          reduction: {
            instructions: [
              {
                strategy: "read_state_compaction",
                segmentIds: ["some-other-segment"],
              },
            ],
          },
        },
      },
    },
  };

  const result = await runReductionBeforeCall({
    turnCtx,
    passes: [
      {
        id: "read_state_compaction",
        phase: "before_call",
        target: "context_segment",
        options: {},
      },
    ],
  });

  const updated = result.turnCtx.segments.find((segment) => segment.id === "read-1-output");
  assert.ok(updated);
  assert.equal(updated?.text, original);
  assert.equal(result.report.length, 1);
  assert.equal(result.report[0]?.id, "read_state_compaction");
  assert.equal(result.report[0]?.changed, false);
  assert.equal(result.report[0]?.skippedReason, "no_segments_replaced");
});

test("runReductionBeforeCall continues after disabled pass and still executes later passes", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "test-session",
    sessionMode: "single",
    provider: "test",
    model: "test",
    prompt: "",
    budget: {
      maxInputTokens: 100000,
      reserveOutputTokens: 1000,
    },
    segments: [
      buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;\n".repeat(200), "output"),
      buildSegment("edit-1-arguments", "edit", "/repo/a.ts", "{\"replace\":\"1\",\"with\":\"2\"}", "arguments"),
    ],
    metadata: {
      workspaceDir: "/tmp",
      policy: {
        decisions: {
          reduction: {
            instructions: [
              {
                strategy: "read_state_compaction",
                segmentIds: ["read-1-output"],
              },
            ],
          },
        },
      },
    },
  };

  const result = await runReductionBeforeCall({
    turnCtx,
    passes: [
      {
        id: "tool_payload_trim",
        phase: "before_call",
        target: "tool_payload",
        enabled: false,
      },
      {
        id: "read_state_compaction",
        phase: "before_call",
        target: "context_segment",
        options: {},
      },
    ],
  });

  const updated = result.turnCtx.segments.find((segment) => segment.id === "read-1-output");
  assert.ok(updated);
  assert.match(updated?.text ?? "", /\[Read stale\]/);
  assert.equal(result.report.length, 2);
  assert.equal(result.report[0]?.id, "tool_payload_trim");
  assert.equal(result.report[0]?.changed, false);
  assert.equal(result.report[0]?.skippedReason, "disabled");
  assert.equal(result.report[1]?.id, "read_state_compaction");
  assert.equal(result.report[1]?.changed, true);
});

test("runReductionBeforeCall does not retrim read-state compaction recovery stubs", async () => {
  const turnCtx: RuntimeTurnContext = {
    sessionId: "test-session",
    sessionMode: "single",
    provider: "test",
    model: "test",
    prompt: "",
    budget: {
      maxInputTokens: 100000,
      reserveOutputTokens: 1000,
    },
    segments: [
      buildSegment("read-1-output", "read", "/repo/a.ts", "const a = 1;\n".repeat(220), "output"),
      buildSegment("edit-1-arguments", "edit", "/repo/a.ts", "{\"replace\":\"1\",\"with\":\"2\"}", "arguments"),
    ],
    metadata: {
      workspaceDir: "/tmp",
      latestUserQuery: "show me the latest file state",
      policy: {
        decisions: {
          reduction: {
            instructions: [
              {
                strategy: "read_state_compaction",
                segmentIds: ["read-1-output"],
              },
              {
                strategy: "tool_payload_trim",
                segmentIds: ["read-1-output"],
                parameters: {
                  payloadKind: "stdout",
                },
              },
            ],
          },
        },
      },
    },
  };

  const result = await runReductionBeforeCall({
    turnCtx,
    passes: [
      {
        id: "read_state_compaction",
        phase: "before_call",
        target: "context_segment",
        options: {},
      },
      {
        id: "tool_payload_trim",
        phase: "before_call",
        target: "tool_payload",
        options: {
          maxChars: 220,
        },
      },
    ],
  });

  const updated = result.turnCtx.segments.find((segment) => segment.id === "read-1-output");
  assert.ok(updated);
  assert.match(updated?.text ?? "", /\[Read stale\]/);
  assert.match(updated?.text ?? "", /memory_fault_recover/);
  assert.equal(result.report.length, 2);
  assert.equal(result.report[0]?.id, "read_state_compaction");
  assert.equal(result.report[0]?.changed, true);
  assert.equal(result.report[1]?.id, "tool_payload_trim");
  assert.equal(result.report[1]?.changed, false);
  assert.equal(result.report[1]?.skippedReason, "recovery_exempt");
});

test("runReductionBeforeCall preserves recovery reads while still trimming neighboring segments", async () => {
  const recovered = [
    "[Memory Fault Recovery] Recovered content for: repo:README.md",
    "Recovered lines: 20-40",
    "--- Recovered Content ---",
    "# Task Plan",
    "- TODO: preserve this recovered block",
    "- Acceptance criteria: no retrim",
    "--- End Recovered Content ---",
  ].join("\n");
  const oversizedToolOutput = JSON.stringify(
    Array.from({ length: 20 }, (_value, index) => ({
      type: "result",
      id: index,
      text: `payload-${index}-${"x".repeat(80)}`,
    })),
    null,
    2,
  );

  const turnCtx: RuntimeTurnContext = {
    sessionId: "test-session",
    sessionMode: "single",
    provider: "test",
    model: "test",
    prompt: "",
    budget: {
      maxInputTokens: 100000,
      reserveOutputTokens: 1000,
    },
    segments: [
      {
        id: "recovery-output",
        kind: "volatile",
        priority: 1,
        text: recovered,
        metadata: {
          toolName: "read",
          path: "/repo/README.md",
          fieldName: "output",
          recovery: {
            source: "memory_fault_recover",
            skipReduction: true,
          },
          toolPayload: {
            toolName: "read",
            path: "/repo/README.md",
          },
        },
      },
      {
        id: "json-output",
        kind: "volatile",
        priority: 1,
        text: oversizedToolOutput,
        metadata: {
          toolName: "bash",
          path: "/tmp/output.json",
          fieldName: "output",
          toolPayload: {
            toolName: "bash",
            path: "/tmp/output.json",
          },
        },
      },
    ],
    metadata: {
      workspaceDir: "/tmp",
      latestUserQuery: "show me the recovered file and summarize the json output",
      policy: {
        decisions: {
          reduction: {
            instructions: [
              {
                strategy: "tool_payload_trim",
                segmentIds: ["recovery-output", "json-output"],
                parameters: {
                  payloadKind: "stdout",
                },
              },
            ],
          },
        },
      },
    },
  };

  const result = await runReductionBeforeCall({
    turnCtx,
    passes: resolveReductionPasses({
      maxToolChars: 160,
    }),
  });

  const recoverySegment = result.turnCtx.segments.find((segment) => segment.id === "recovery-output");
  const jsonSegment = result.turnCtx.segments.find((segment) => segment.id === "json-output");
  assert.ok(recoverySegment);
  assert.ok(jsonSegment);
  assert.equal(recoverySegment?.text, recovered);
  assert.notEqual(jsonSegment?.text, oversizedToolOutput);
  assert.match(jsonSegment?.text ?? "", /"reduced": "json_array"/);
  assert.equal(result.report[1]?.id, "tool_payload_trim");
  assert.equal(result.report[1]?.changed, true);
  assert.deepEqual(result.report[1]?.touchedSegmentIds, ["json-output"]);
});

test("runReductionBeforeCall outlines the first large code read and leaves the second read intact", async () => {
  const largeCode = `
export function loadConfig(file: string) {
  return file.trim();
}

export function saveConfig(file: string, text: string) {
  return text + file;
}
`.repeat(30);

  const turnCtx: RuntimeTurnContext = {
    sessionId: "test-session",
    sessionMode: "single",
    provider: "test",
    model: "test",
    prompt: "",
    budget: {
      maxInputTokens: 100000,
      reserveOutputTokens: 1000,
    },
    segments: [
      buildSegment("read-1-output", "read", "/repo/config.ts", largeCode, "output"),
      buildSegment("read-2-output", "read", "/repo/config.ts", largeCode, "output"),
    ],
    metadata: {
      workspaceDir: "/tmp",
      policy: {
        decisions: {
          reduction: {
            instructions: [
              {
                strategy: "tool_payload_trim",
                segmentIds: ["read-1-output", "read-2-output"],
                parameters: { payloadKind: "stdout" },
              },
            ],
          },
        },
      },
    },
  };

  const result = await runReductionBeforeCall({
    turnCtx,
    passes: [
      {
        id: "tool_payload_trim",
        phase: "before_call",
        target: "context_segment",
        options: {},
      },
    ],
  });

  const first = result.turnCtx.segments.find((segment) => segment.id === "read-1-output");
  const second = result.turnCtx.segments.find((segment) => segment.id === "read-2-output");
  assert.ok(first);
  assert.ok(second);
  assert.match(first?.text ?? "", /\[code outlined lines=/);
  assert.match(first?.text ?? "", /body elided by LightRSI/);
  assert.match(second?.text ?? "", /export function loadConfig/);
  assert.doesNotMatch(second?.text ?? "", /\[code outlined lines=/);
});

test("runReductionBeforeCall carries disclosed read paths through metadata across turns", async () => {
  const largeCode = `
export function loadConfig(file: string) {
  return file.trim();
}

export function saveConfig(file: string, text: string) {
  return text + file;
}
`.repeat(30);

  const firstTurn: RuntimeTurnContext = {
    sessionId: "test-session",
    sessionMode: "single",
    provider: "test",
    model: "test",
    prompt: "",
    budget: {
      maxInputTokens: 100000,
      reserveOutputTokens: 1000,
    },
    segments: [
      buildSegment("read-1-output", "read", "/repo/config.ts", largeCode, "output"),
    ],
    metadata: {
      workspaceDir: "/tmp",
      policy: {
        decisions: {
          reduction: {
            instructions: [
              {
                strategy: "tool_payload_trim",
                segmentIds: ["read-1-output"],
                parameters: { payloadKind: "stdout" },
              },
            ],
          },
        },
      },
    },
  };

  const firstResult = await runReductionBeforeCall({
    turnCtx: firstTurn,
    passes: [
      {
        id: "tool_payload_trim",
        phase: "before_call",
        target: "context_segment",
        options: {},
      },
    ],
  });

  const disclosedReadPaths = firstResult.turnCtx.metadata?.disclosedReadPaths;
  assert.ok(Array.isArray(disclosedReadPaths));
  assert.ok(disclosedReadPaths?.includes("/repo/config.ts".toLowerCase()));

  const secondTurn: RuntimeTurnContext = {
    sessionId: "test-session",
    sessionMode: "single",
    provider: "test",
    model: "test",
    prompt: "",
    budget: {
      maxInputTokens: 100000,
      reserveOutputTokens: 1000,
    },
    segments: [
      buildSegment("read-2-output", "read", "/repo/config.ts", largeCode, "output"),
    ],
    metadata: {
      workspaceDir: "/tmp",
      disclosedReadPaths,
      policy: {
        decisions: {
          reduction: {
            instructions: [
              {
                strategy: "tool_payload_trim",
                segmentIds: ["read-2-output"],
                parameters: { payloadKind: "stdout" },
              },
            ],
          },
        },
      },
    },
  };

  const secondResult = await runReductionBeforeCall({
    turnCtx: secondTurn,
    passes: [
      {
        id: "tool_payload_trim",
        phase: "before_call",
        target: "context_segment",
        options: {},
      },
    ],
  });

  const second = secondResult.turnCtx.segments.find((segment) => segment.id === "read-2-output");
  assert.ok(second);
  assert.match(second?.text ?? "", /export function loadConfig/);
  assert.doesNotMatch(second?.text ?? "", /\[code outlined lines=/);
});
