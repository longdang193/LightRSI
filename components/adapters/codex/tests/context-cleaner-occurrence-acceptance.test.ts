import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  readContextCleanReceipt,
  createContextCleanerControlPlane,
  createContextCleanerControlService,
  type ContextCleanOccurrenceSelection,
  type ContextCleanSnapshot,
} from "@lightrsi/cleaner";
import { reserveUnusedPort } from "@lightrsi/host-adapter";

import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { createCodexContextCleanerBridge } from "../src/context-cleaner/index.js";
import type { JsonObject } from "../src/context-history/index.js";
import { createConsoleLogger } from "../src/logger.js";
import { startCodexResponsesProxy } from "../src/proxy-runtime.js";

async function readBody(request: Parameters<Parameters<typeof createServer>[0]>[0]): Promise<JsonObject> {
  const text = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
  return JSON.parse(text) as JsonObject;
}

async function startUpstream(): Promise<{
  baseUrl: string;
  requests: JsonObject[];
  close(): Promise<void>;
}> {
  const requests: JsonObject[] = [];
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/responses") {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    requests.push(await readBody(request));
    const id = `occurrence-acceptance-response-${requests.length}`;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      id,
      object: "response",
      status: "completed",
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: `KEEP_${id}` }],
      }],
    }));
  });
  const port = await reserveUnusedPort();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function userOccurrence(snapshot: ContextCleanSnapshot, index: number) {
  const items = snapshot.items.filter((item) => item.role === "user" || item.kind === "user");
  const item = items[index];
  assert.ok(item, `missing user occurrence ${index}: ${JSON.stringify(items)}`);
  return item;
}

function releaseSelection(
  snapshot: ContextCleanSnapshot,
  userIndex: number,
  retainedFindings: string[] = [],
): ContextCleanOccurrenceSelection {
  const item = userOccurrence(snapshot, userIndex);
  return {
    stableId: item.stableId,
    fingerprint: item.fingerprint,
    completionEvidence: [item.stableId],
    continuingUseful: false,
    releaseIntent: "release",
    retainedFindings,
    nothingReusable: retainedFindings.length === 0,
    dependencyDirection: "none",
  };
}

function forwardedText(request: JsonObject | undefined): string {
  return JSON.stringify(request?.input ?? request);
}

test("normal Cleaner entrypoint releases exact occurrences cumulatively", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-codex-occurrence-acceptance-"));
  const upstream = await startUpstream();
  let runtime: Awaited<ReturnType<typeof startCodexResponsesProxy>> | undefined;
  try {
    const sessionId = "codex-occurrence-acceptance-session";
    const config = normalizeTokenPilotCodexConfig({
      stateDir,
      proxyPort: await reserveUnusedPort(),
      upstreamProvider: "OpenAI",
      upstream: {
        baseUrl: upstream.baseUrl,
        wireApi: "responses",
        requiresOpenAIAuth: false,
      },
      modules: { stabilizer: false, reduction: false },
      contextRewrite: {
        enabled: true,
        providerCompatibilityProbe: "mock_fixture",
      },
    } as any);
    runtime = await startCodexResponsesProxy({
      config,
      logger: createConsoleLogger(false),
      allowMockFixtureEvidence: true,
    });

    let previousResponseId: string | undefined;
    const send = async (content: string) => {
      const response = await fetch(`${runtime!.baseUrl}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.4-mini",
          stream: false,
          ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
          metadata: { tokenpilotSessionId: sessionId },
          input: [{ role: "user", content }],
        }),
      });
      assert.equal(response.status, 200);
      previousResponseId = (await response.json() as { id: string }).id;
    };

    await send("RETAINED_SENTINEL");
    await send("DUPLICATE_OCCURRENCE_CONTENT_A");
    await send("OCCURRENCE_CONTENT_B");
    const controlPlane = createContextCleanerControlPlane({ stateDir });
    const bridge = createCodexContextCleanerBridge({ stateDir, controlPlane });
    const cleaner = createContextCleanerControlService({ stateDir, bridge });

    const firstSnapshot = await cleaner.inspect(sessionId);
    const firstRelease = await cleaner.releaseOccurrences(sessionId, [
      releaseSelection(firstSnapshot, 1, [userOccurrence(firstSnapshot, 0).stableId]),
    ]);
    assert.equal(firstRelease.status, "scheduled");
    await send("CURRENT_AFTER_A");
    assert.doesNotMatch(forwardedText(upstream.requests.at(-1)), /DUPLICATE_OCCURRENCE_CONTENT_A/);
    assert.match(
      forwardedText(upstream.requests.at(-1)),
      /OCCURRENCE_CONTENT_B/,
      JSON.stringify(upstream.requests, null, 2),
    );

    const secondSnapshot = await cleaner.inspect(sessionId);
    const secondRelease = await cleaner.releaseOccurrences(sessionId, [
      releaseSelection(secondSnapshot, 1),
    ]);
    assert.equal(secondRelease.status, "scheduled");
    await send("CURRENT_AFTER_B");
    assert.equal(await cleaner.readReceipt(secondRelease.planId).then((receipt) => receipt?.status), "applied");
    assert.doesNotMatch(forwardedText(upstream.requests.at(-1)), /DUPLICATE_OCCURRENCE_CONTENT_A/);
    assert.doesNotMatch(
      forwardedText(upstream.requests.at(-1)),
      /OCCURRENCE_CONTENT_B/,
      JSON.stringify(upstream.requests, null, 2),
    );

    await send("OCCURRENCE_CONTENT_C");
    const thirdSnapshot = await cleaner.inspect(sessionId);
    const cancelled = await cleaner.releaseOccurrences(sessionId, [
      releaseSelection(thirdSnapshot, thirdSnapshot.items.filter((item) => item.role === "user" || item.kind === "user").length - 1),
    ]);
    assert.equal(cancelled.status, "scheduled");
    assert.equal((await cleaner.cancel(cancelled.planId)).status, "cancelled");
    await send("CURRENT_AFTER_CANCEL");
    const afterCancel = forwardedText(upstream.requests.at(-1));
    assert.doesNotMatch(afterCancel, /DUPLICATE_OCCURRENCE_CONTENT_A/);
    assert.doesNotMatch(afterCancel, /OCCURRENCE_CONTENT_B/);
    assert.match(afterCancel, /OCCURRENCE_CONTENT_C/);

    await send("DUPLICATE_OCCURRENCE_CONTENT_A");
    const duplicateForward = forwardedText(upstream.requests.at(-1));
    assert.equal(
      duplicateForward.split("DUPLICATE_OCCURRENCE_CONTENT_A").length - 1,
      1,
    );

    const recoveredControlPlane = createContextCleanerControlPlane({ stateDir });
    const recoveredBridge = createCodexContextCleanerBridge({
      stateDir,
      controlPlane: recoveredControlPlane,
    });
    const recoveredCleaner = createContextCleanerControlService({
      stateDir,
      bridge: recoveredBridge,
    });
    const applied = await recoveredCleaner.readReceipt(firstRelease.planId);
    assert.equal(applied?.status, "applied");
    assert.deepEqual(
      applied?.evidence && "occurrenceSelections" in applied.evidence
        ? applied.evidence.occurrenceSelections.map((selection) => selection.stableId)
        : [],
      [firstRelease.evidence?.occurrenceSelections?.[0]?.stableId],
    );
    assert.equal(upstream.requests.length, 8);
    const persisted = await readContextCleanReceipt({ stateDir, planId: firstRelease.planId });
    assert.equal(persisted.value?.status, "applied");
  } finally {
    await runtime?.close();
    await upstream.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});
