import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applySessionTaskRegistryPatch,
  createEmptySessionTaskRegistry,
  highestContiguousProcessedTurnSeq,
  loadSessionTaskRegistry,
  mergeProcessedTurnRanges,
  persistSessionTaskRegistry,
  processedTurnRanges,
} from "../src/index.js";

test("registry preserves non-contiguous processed coverage across restart", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-history-registry-"));
  try {
    const initial = createEmptySessionTaskRegistry("session-registry");
    const processedLater = applySessionTaskRegistryPatch(initial, {
      processedTurnRanges: [{ fromTurnSeqInclusive: 2, toTurnSeqInclusive: 2 }],
      lastProcessedTurnSeq: 0,
    });
    await persistSessionTaskRegistry(stateDir, processedLater);

    const restarted = await loadSessionTaskRegistry(stateDir, "session-registry");
    assert.deepEqual(processedTurnRanges(restarted), [
      { fromTurnSeqInclusive: 2, toTurnSeqInclusive: 2 },
    ]);
    assert.equal(restarted.lastProcessedTurnSeq, 0);

    const merged = mergeProcessedTurnRanges(restarted, [
      { fromTurnSeqInclusive: 1, toTurnSeqInclusive: 1 },
    ]);
    assert.deepEqual(merged, [{ fromTurnSeqInclusive: 1, toTurnSeqInclusive: 2 }]);
    assert.equal(highestContiguousProcessedTurnSeq(merged), 2);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("processed ranges own the derived contiguous watermark", () => {
  const next = applySessionTaskRegistryPatch(createEmptySessionTaskRegistry("session-coverage"), {
    processedTurnRanges: [
      { fromTurnSeqInclusive: 2, toTurnSeqInclusive: 2 },
    ],
    lastProcessedTurnSeq: 99,
  });

  assert.deepEqual(next.processedTurnRanges, [
    { fromTurnSeqInclusive: 2, toTurnSeqInclusive: 2 },
  ]);
  assert.equal(next.lastProcessedTurnSeq, 0);
});
