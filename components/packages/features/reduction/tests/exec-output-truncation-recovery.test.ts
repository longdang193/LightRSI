import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RuntimeTurnContext } from "@lightrsi/kernel";
import { execOutputTruncationBeforeCall } from "../src/passes/pass-exec-output-truncation.js";

test("exec output truncation publishes exact recovery reference", async () => {
  const archiveDir = await mkdtemp(join(tmpdir(), "lightrsi-exec-recovery-"));
  try {
    const turnCtx: RuntimeTurnContext = {
      sessionId: "exec-recovery-session",
      sessionMode: "single",
      provider: "test",
      model: "test",
      prompt: "",
      budget: { maxInputTokens: 100000, reserveOutputTokens: 1000 },
      segments: [{
        id: "exec-output",
        kind: "volatile",
        priority: 1,
        text: `${"output line\n".repeat(200)}tail`,
        metadata: { toolName: "bash", path: "/repo/run.sh" },
      }],
      metadata: {
        policy: {
          decisions: {
            reduction: {
              instructions: [{ strategy: "exec_output_truncation", segmentIds: ["exec-output"] }],
            },
          },
        },
      },
    };

    const result = await execOutputTruncationBeforeCall.beforeCall?.({
      turnCtx,
      spec: {
        id: "exec_output_truncation",
        phase: "before_call",
        target: "context_segment",
        options: {
          archiveDir,
          toolThresholds: { bash: 100 },
          headPreviewSize: 20,
          tailPreviewSize: 20,
        },
      },
    });

    assert.equal(result?.changed, true);
    const segment = result?.turnCtx?.segments[0];
    assert.ok(segment);
    assert.match(segment.text, /"artifactRef":"artifact:v2:/);
    const reduction = (segment.metadata?.reduction as Record<string, unknown>)
      .execOutputTruncation as Record<string, unknown>;
    assert.match(String(reduction.artifactRef), /^artifact:v2:[a-f0-9]{64}$/);
  } finally {
    await rm(archiveDir, { recursive: true, force: true });
  }
});
