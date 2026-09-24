import assert from "node:assert/strict";
import test from "node:test";

import { createBenchmarkTiming } from "../src/benchmark-timing.js";
import {
  captureLiveProvider,
  compareProviderUsage,
  cumulativeBreakEven,
  cumulativeBreakEvenByLabel,
  createBenchmarkReservationLedger,
  estimateProviderCost,
  evaluateGitPreflight,
  providerShapesComparableBeforeRelease,
  summarizeSharedSeedUsage,
  usageDelta,
  userInputText,
  type ProviderShape,
} from "../scripts/benchmark-context-cleaner.js";

test("benchmark reservation ledger settles completed provider attempts", () => {
  const ledger = createBenchmarkReservationLedger({
    spendingCapUsd: 1,
    perAttemptReservationUsd: 0.6,
    pricing: { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0, outputUsdPerMillion: 1 },
  });
  const reservation = ledger.reserve({ pairId: "pair-1", arm: "baseline", checkpoint: "release" });

  assert.ok(reservation);
  assert.deepEqual(reservation, {
    pairId: "pair-1",
    arm: "baseline",
    checkpoint: "release",
    attemptIndex: 0,
    reservedCostUsd: 0.6,
  });
  assert.equal(ledger.outstandingCostUsd, 0.6);
  ledger.settle(reservation, { inputTokens: 100_000, outputTokens: 0, totalTokens: 100_000, cachedInputTokens: 0 });
  assert.equal(ledger.observedCostUsd, 0.1);
  assert.equal(ledger.outstandingCostUsd, 0);
  assert.ok(ledger.reserve({ pairId: "pair-1", arm: "cleaner", checkpoint: "release" }));
});

test("benchmark reservation ledger stops after missing provider usage", () => {
  const ledger = createBenchmarkReservationLedger({
    spendingCapUsd: 1,
    perAttemptReservationUsd: 0.6,
    pricing: { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0, outputUsdPerMillion: 1 },
  });
  const reservation = ledger.reserve({ pairId: "pair-1", arm: "baseline", checkpoint: "release" });

  assert.ok(reservation);
  ledger.settle(reservation, null);
  assert.equal(ledger.stopReason, "provider_usage_unavailable");
  assert.equal(ledger.reserve({ pairId: "pair-1", arm: "cleaner", checkpoint: "release" }), null);
});

test("benchmark counts shared seed usage once", () => {
  const seed = { inputTokens: 10, outputTokens: 1, totalTokens: 11, cachedInputTokens: 0 };
  const baseline = summarizeSharedSeedUsage([
    { arm: "baseline", seedRequestCount: 1, providerUsage: [seed, { ...seed, inputTokens: 99 }] } as never,
    { arm: "cleaner", seedRequestCount: 1, providerUsage: [seed, { ...seed, inputTokens: 88 }] } as never,
  ]);

  assert.equal(baseline.status, "complete");
  assert.equal(baseline.totals.inputTokens, 10);
});

test("summarizes flat request phases without summing overlaps", () => {
  let now = 100;
  const timing = createBenchmarkTiming(() => now);

  timing.mark("handlerStart");
  now = 110;
  timing.mark("bodyComplete");
  now = 130;
  timing.mark("dispatchStart");
  now = 150;
  timing.mark("upstreamHeaders");
  now = 165;
  timing.mark("firstUsefulOutput");
  now = 190;
  timing.mark("responseFinish");
  now = 205;
  timing.mark("durableCompletion");

  assert.deepEqual(timing.snapshot("streamed"), {
    responseMode: "streamed",
    complete: true,
    marks: {
      handlerStart: 100,
      bodyComplete: 110,
      dispatchStart: 130,
      upstreamHeaders: 150,
      firstUsefulOutput: 165,
      responseFinish: 190,
      durableCompletion: 205,
    },
    durationsMs: {
      handlerToBody: 10,
      bodyToDispatch: 20,
      dispatchToHeaders: 20,
      dispatchToFirstUsefulOutput: 35,
      handlerToFinish: 90,
      handlerToDurableCompletion: 105,
    },
  });
});

test("marks incomplete requests instead of inventing missing durations", () => {
  const timing = createBenchmarkTiming(() => 100);
  timing.mark("handlerStart");
  timing.mark("responseFinish");

  const snapshot = timing.snapshot("buffered");
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.durationsMs.handlerToFinish, 0);
  assert.equal(snapshot.durationsMs.handlerToDurableCompletion, undefined);
});

test("benchmark occurrence oracle ignores assistant echoes", () => {
  assert.equal(
    userInputText({
      body: {
        input: [
          { role: "user", content: "RELEASE_A_short_noisy" },
          { role: "assistant", content: [{ type: "output_text", text: "Noted RELEASE_A_short_noisy" }] },
        ],
      },
    } as never),
    '"RELEASE_A_short_noisy"',
  );
});

test("benchmark rejects A/B pairs that diverge before Cleaner release", () => {
  const shape = (inputFingerprint: string): ProviderShape => ({
    inputBytes: 1,
    inputFingerprint,
    userItemCount: 1,
    replayableItemCount: 1,
    inputTypeCounts: {},
    outputItemTypes: [],
    providerLatencyMs: null,
    providerHeadersLatencyMs: null,
  });
  const labels = ["retained", "release_a", "release_b", "after_release_a"];

  assert.equal(
    providerShapesComparableBeforeRelease(
      labels,
      [shape("same-1"), shape("same-2"), shape("same-3"), shape("cleaner")],
      labels,
      [shape("same-1"), shape("same-2"), shape("different"), shape("cleaner")],
    ),
    false,
  );
  assert.equal(
    providerShapesComparableBeforeRelease(
      labels,
      [shape("same-1"), shape("same-2"), shape("same-3"), shape("baseline")],
      labels,
      [shape("same-1"), shape("same-2"), shape("same-3"), shape("cleaner")],
    ),
    true,
  );
});

test("benchmark rejects cache identity drift before Cleaner release", () => {
  const shape = (promptCacheKey: string, providerWirePrefixHash: string): ProviderShape => ({
    inputBytes: 1,
    inputFingerprint: "same-input",
    userItemCount: 1,
    replayableItemCount: 1,
    inputTypeCounts: {},
    outputItemTypes: [],
    providerLatencyMs: null,
    providerHeadersLatencyMs: null,
    promptCacheKey,
    responsePromptCacheKey: promptCacheKey,
    providerWirePrefixHash,
    providerWirePrefixItemCount: 1,
    promptCacheBreakpoint: false,
  });
  const labels = ["retained", "release_a", "after_release_a"];

  assert.equal(
    providerShapesComparableBeforeRelease(
      labels,
      [shape("same-key", "same-wire"), shape("same-key", "same-wire"), shape("baseline", "baseline-wire")],
      labels,
      [shape("different-key", "same-wire"), shape("same-key", "same-wire"), shape("cleaner", "cleaner-wire")],
    ),
    false,
  );
});

test("benchmark ignores intentional post-release drift for early Cleaner release", () => {
  const shape = (inputFingerprint: string): ProviderShape => ({
    inputBytes: 1,
    inputFingerprint,
    userItemCount: 1,
    replayableItemCount: 1,
    inputTypeCounts: {},
    outputItemTypes: [],
    providerLatencyMs: null,
    providerHeadersLatencyMs: null,
  });
  const labels = ["retained", "release_a", "noise_before_0", "after_release_a"];

  assert.equal(
    providerShapesComparableBeforeRelease(
      labels,
      [shape("same-1"), shape("same-2"), shape("baseline-noise"), shape("baseline")],
      labels,
      [shape("same-1"), shape("same-2"), shape("cleaner-noise"), shape("cleaner")],
      "early",
    ),
    true,
  );
});

test("benchmark keeps missing provider usage out of economic deltas", () => {
  const baseline = [{ inputTokens: 10, outputTokens: 2, totalTokens: 12, cachedInputTokens: 0 }, null];
  const cleaner = [
    { inputTokens: 8, outputTokens: 2, totalTokens: 10, cachedInputTokens: 0 },
    { inputTokens: 8, outputTokens: 2, totalTokens: 10, cachedInputTokens: 0 },
  ];

  assert.equal(usageDelta(cleaner, baseline, "inputTokens"), null);
  assert.equal(usageDelta(cleaner, [baseline[0]!], "cachedInputTokens"), null);
});

test("benchmark estimates provider cost from pinned input, cache, and output rates", () => {
  assert.equal(
    estimateProviderCost(
      {
        status: "complete",
        totals: { inputTokens: 100, outputTokens: 10, cachedInputTokens: 40 },
      },
      { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.1, outputUsdPerMillion: 6 },
    ),
    0.000124,
  );
  assert.equal(
    estimateProviderCost(
      {
        status: "incomplete",
        totals: { inputTokens: null, outputTokens: null, cachedInputTokens: null },
      },
      { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.1, outputUsdPerMillion: 6 },
    ),
    null,
  );
});

test("benchmark accepts recorded zero cached tokens", () => {
  const baseline = [{ inputTokens: 10, outputTokens: 2, totalTokens: 12, cachedInputTokens: 0 }];
  const cleaner = [{ inputTokens: 8, outputTokens: 2, totalTokens: 10, cachedInputTokens: 0 }];

  assert.equal(usageDelta(cleaner, baseline, "inputTokens"), -2);
  assert.equal(usageDelta(cleaner, baseline, "cachedInputTokens"), 0);
});

test("benchmark rejects invalid cached tokens", () => {
  const baseline = [{ inputTokens: 10, outputTokens: 2, totalTokens: 12, cachedInputTokens: 11 }];
  const cleaner = [{ inputTokens: 8, outputTokens: 2, totalTokens: 10, cachedInputTokens: 0 }];

  assert.equal(usageDelta(cleaner, baseline, "inputTokens"), null);
});

test("benchmark compares unequal continuation paths by logical checkpoint", () => {
  const usage = (inputTokens: number) => ({
    inputTokens,
    outputTokens: 2,
    totalTokens: inputTokens + 2,
    cachedInputTokens: 0,
  });
  const comparison = compareProviderUsage(
    [usage(7), usage(7), usage(1)],
    [usage(10), usage(8)],
    ["release", "continuation", "recovery"],
  );

  assert.equal(comparison.status, "complete");
  assert.equal(comparison.inputTokensDelta, -3);
  assert.deepEqual(comparison.cumulativeInputTokens?.checkpoints, [
    { label: "release", keepCost: 10, releaseCost: 7, netSavings: 3 },
    { label: "continuation", keepCost: 18, releaseCost: 14, netSavings: 4 },
    { label: "recovery", keepCost: 18, releaseCost: 15, netSavings: 3 },
  ]);
});

test("benchmark keeps incomplete unequal paths inconclusive", () => {
  const usage = { inputTokens: 10, outputTokens: 2, totalTokens: 12, cachedInputTokens: 0 };
  const comparison = compareProviderUsage([usage, null], [usage], ["release", "recovery"]);

  assert.equal(comparison.status, "incomplete");
  assert.equal(comparison.inputTokensDelta, null);
  assert.equal(comparison.cumulativeInputTokens, null);
});

test("benchmark records transport failures before provider dispatch completes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("provider unavailable");
  };
  const capture = captureLiveProvider("https://provider.example/v1");
  try {
    await assert.rejects(
      () => fetch("https://provider.example/v1/responses", {
        method: "POST",
        body: JSON.stringify({ input: [] }),
      }),
      /provider unavailable/u,
    );
    await capture.close();
    assert.equal(capture.requests.length, 1);
    assert.equal(capture.requests[0]?.outcome, "transport_error");
    assert.equal(capture.requests[0]?.failureReason, "provider unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("benchmark aligns local costs by checkpoint instead of request count", () => {
  assert.deepEqual(
    cumulativeBreakEvenByLabel(
      [{ label: "release", cost: 10 }, { label: "continuation", cost: 8 }],
      [{ label: "release", cost: 7 }, { label: "continuation", cost: 7 }, { label: "recovery", cost: 1 }],
    ).checkpoints,
    [
      { label: "release", keepCost: 10, releaseCost: 7, netSavings: 3 },
      { label: "continuation", keepCost: 18, releaseCost: 14, netSavings: 4 },
      { label: "recovery", keepCost: 18, releaseCost: 15, netSavings: 3 },
    ],
  );
});

test("benchmark reports delayed, temporary, and recovery-erased break-even", () => {
  assert.deepEqual(
    cumulativeBreakEven([10, 10, 10], [12, 12, 4], ["release", "continuation", "recovery"]),
    {
      checkpoints: [
        { label: "release", keepCost: 10, releaseCost: 12, netSavings: -2 },
        { label: "continuation", keepCost: 20, releaseCost: 24, netSavings: -4 },
        { label: "recovery", keepCost: 30, releaseCost: 28, netSavings: 2 },
      ],
      firstBreakEven: "recovery",
      sustainedBreakEven: true,
    },
  );
  assert.equal(
    cumulativeBreakEven([10, 10, 10], [8, 14, 10], ["release", "continuation", "recovery"]).sustainedBreakEven,
    false,
  );
  assert.equal(
    cumulativeBreakEven([10, 10], [8, 8], ["release", "continuation"]).sustainedBreakEven,
    true,
  );
});

test("benchmark Git preflight ignores dirty SHA and marks mismatches", () => {
  assert.deepEqual(
    evaluateGitPreflight({
      clean: false,
      actualSha: "newer",
      expectedRuntimeSha: "expected-runtime",
      expectedBenchmarkSha: "expected-benchmark",
    }),
    {
      status: "dirty",
      actualSha: null,
      expectedRuntimeSha: "expected-runtime",
      expectedBenchmarkSha: "expected-benchmark",
      runtimeMatch: null,
      benchmarkMatch: null,
    },
  );
  assert.equal(
    evaluateGitPreflight({
      clean: true,
      actualSha: "abcdef123456",
      expectedRuntimeSha: "abcdef1",
      expectedBenchmarkSha: "abcdef1",
    }).status,
    "clean_match",
  );
});
