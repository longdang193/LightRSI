import assert from "node:assert/strict";
import test from "node:test";

import { createBenchmarkTiming } from "../src/benchmark-timing.js";
import {
  providerShapesComparableBeforeRelease,
  userInputText,
  type ProviderShape,
} from "../scripts/benchmark-context-cleaner.js";

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
