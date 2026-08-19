import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";

import {
  createAcceptanceSentinels,
  createTemporaryAcceptanceEnvironment,
  MockUpstreamRecorder,
  reserveUnusedPort,
  runAcceptanceHarness,
  type AcceptancePhase,
  type AcceptanceSentinels,
  type MockUpstreamResponse,
} from "@lightrsi/host-adapter";
import { loadSessionTaskRegistry } from "@lightrsi/history";

import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { createConsoleLogger } from "../src/logger.js";
import { startCodexResponsesProxy } from "../src/proxy-runtime.js";

type JsonObject = Record<string, unknown>;

const TEST_UUID = "9c281934-c878-4b59-82a8-ec87caedce41";
const SESSION_ID = "sess-gua06-codex-lifecycle";

function asRecord(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

async function readJsonBody(
  request: Parameters<Parameters<typeof createServer>[0]>[0],
): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonObject;
}

function responseMessage(text: string): JsonObject {
  return {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  };
}

function upstreamResponse(
  id: string,
  output: JsonObject[],
): MockUpstreamResponse {
  return {
    status: 200,
    body: {
      id,
      object: "response",
      status: "completed",
      output,
    },
  };
}

function queuedPhaseResponses(phase: AcceptancePhase): MockUpstreamResponse[] {
  const oldCallId = `call-gua06-${phase}-evict`;
  const keepCallId = `call-gua06-${phase}-keep`;
  return [
    upstreamResponse(`resp-gua06-${phase}-1`, [{
      id: `item-gua06-${phase}-evict`,
      type: "function_call",
      call_id: oldCallId,
      name: "read_fixture",
      arguments: "{}",
    }]),
    upstreamResponse(`resp-gua06-${phase}-2`, [responseMessage("old fixture task completed")]),
    upstreamResponse(`resp-gua06-${phase}-3`, [{
      id: `item-gua06-${phase}-keep`,
      type: "function_call",
      call_id: keepCallId,
      name: "read_fixture",
      arguments: "{}",
    }]),
    upstreamResponse(`resp-gua06-${phase}-4`, [responseMessage("current fixture task remains active")]),
    upstreamResponse(`resp-gua06-${phase}-5`, [responseMessage(`accepted ${phase}`)]),
  ];
}

function estimatorInput(payload: JsonObject): {
  registry: { version: number };
  delta: {
    coveredTurnAbsIds: string[];
    toolResults: Array<{
      anchor: { turnAbsId: string };
      summary: string;
    }>;
  };
} {
  const input = Array.isArray(payload.input) ? payload.input : [];
  const userItem = input
    .map(asRecord)
    .find((item) => item?.role === "user");
  const content = Array.isArray(userItem?.content) ? userItem.content : [];
  const text = content
    .map(asRecord)
    .find((item) => item?.type === "input_text")?.text;
  if (typeof text !== "string") {
    throw new Error("GUA-06 estimator request is missing the canonical lifecycle input");
  }
  return JSON.parse(text) as ReturnType<typeof estimatorInput>;
}

function nextTurnAbsId(turnAbsId: string): string | undefined {
  const match = /^(.*:t)(\d+)$/u.exec(turnAbsId);
  if (!match) return undefined;
  return `${match[1]}${Number(match[2]) + 1}`;
}

async function startLifecycleEstimator(
  sentinels: AcceptanceSentinels,
): Promise<{
  baseUrl: string;
  registryVersions: number[];
  errors: string[];
  close(): Promise<void>;
}> {
  const registryVersions: number[] = [];
  const errors: string[] = [];
  let callCount = 0;
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST" || request.url !== "/responses") {
        response.statusCode = 404;
        response.end("not found");
        return;
      }
      const input = estimatorInput(await readJsonBody(request));
      callCount += 1;
      registryVersions.push(input.registry.version);

      const evictResult = input.delta.toolResults.find((result) => (
        result.summary.includes(sentinels.evict)
      ));
      const keepResult = input.delta.toolResults.find((result) => (
        result.summary.includes(sentinels.keep)
      ));
      if (!evictResult || !keepResult) {
        throw new Error("GUA-06 estimator delta is missing an eviction or retention tool result");
      }

      const keepTurnIds = new Set([
        keepResult.anchor.turnAbsId,
        nextTurnAbsId(keepResult.anchor.turnAbsId),
      ].filter((value): value is string => Boolean(value)));
      const evictTurnIds = input.delta.coveredTurnAbsIds.filter(
        (turnAbsId) => !keepTurnIds.has(turnAbsId),
      );
      const output = {
        baseVersion: input.registry.version,
        taskUpdates: [
          {
            taskId: `task-gua06-evict-${callCount}`,
            objective: "finish the synthetic task selected for eviction",
            lifecycle: "evictable",
            coveredTurnAbsIds: evictTurnIds,
            completionEvidence: ["the synthetic tool-backed task completed"],
            evictableReason: "the session moved to a different synthetic task",
          },
          {
            taskId: `task-gua06-keep-${callCount}`,
            objective: "continue the retained synthetic task",
            lifecycle: "active",
            coveredTurnAbsIds: [...keepTurnIds].filter((turnAbsId) => (
              input.delta.coveredTurnAbsIds.includes(turnAbsId)
            )),
          },
        ],
      };
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        id: `estimator-gua06-${callCount}`,
        object: "response",
        status: "completed",
        output: [responseMessage(JSON.stringify(output))],
      }));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
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
    baseUrl: `http://127.0.0.1:${port}`,
    registryVersions,
    errors,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function requestMetadata(phase: AcceptancePhase, subject: boolean): JsonObject {
  return {
    tokenpilotSessionId: SESSION_ID,
    ...(subject ? { acceptanceSubject: phase } : {}),
  };
}

async function runAcceptancePhase(params: {
  phase: AcceptancePhase;
  stateDir: string;
  upstream: MockUpstreamRecorder;
  estimatorBaseUrl: string;
  sentinels: AcceptanceSentinels;
  previousResponseId?: string;
}): Promise<{ originalRequest: JsonObject; responseId: string }> {
  params.upstream.setPhase(params.phase);
  params.upstream.enqueueResponses(queuedPhaseResponses(params.phase));
  const config = normalizeTokenPilotCodexConfig({
    stateDir: params.stateDir,
    proxyPort: await reserveUnusedPort(),
    upstreamProvider: "OpenAI",
    upstream: {
      baseUrl: `${params.upstream.url}/v1`,
      wireApi: "responses",
      requiresOpenAIAuth: false,
    },
    modules: { stabilizer: false, reduction: false },
    taskStateEstimator: {
      enabled: true,
      baseUrl: params.estimatorBaseUrl,
      apiKey: "synthetic-gua06-estimator-key",
      model: "synthetic-gua06-estimator",
      batchTurns: 4,
    },
    contextRewrite: {
      enabled: true,
      providerCompatibilityProbe: "mock_fixture",
    },
  });
  const runtime = await startCodexResponsesProxy({
    config,
    logger: createConsoleLogger(false),
    allowMockFixtureEvidence: true,
  });
  let previousResponseId = params.previousResponseId;

  const send = async (input: unknown[], subject = false): Promise<{
    request: JsonObject;
    responseId: string;
  }> => {
    const request: JsonObject = {
      model: "gpt-5.4-mini",
      stream: false,
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
      metadata: requestMetadata(params.phase, subject),
      input,
    };
    const response = await fetch(`${runtime.baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const responseText = await response.text();
    assert.equal(response.status, 200, responseText);
    const body = JSON.parse(responseText) as JsonObject;
    const responseId = typeof body.id === "string" ? body.id : "";
    assert.ok(responseId);
    previousResponseId = responseId;
    return { request, responseId };
  };

  try {
    const evictCallId = `call-gua06-${params.phase}-evict`;
    const keepCallId = `call-gua06-${params.phase}-keep`;
    await send([{ role: "user", content: `start old synthetic task ${params.phase}` }]);
    await send([{
      type: "function_call_output",
      call_id: evictCallId,
      output: `${params.sentinels.evict}\n${"discardable fixture payload ".repeat(32)}`,
    }]);
    await send([{
      role: "user",
      content: `${params.sentinels.keep} start current synthetic task ${params.phase}`,
    }]);
    await send([{
      type: "function_call_output",
      call_id: keepCallId,
      output: `${params.sentinels.keep} retained fixture result`,
    }]);
    const subject = await send([{
      role: "user",
      content: `GUA06_SUBJECT_${params.phase}`,
    }], true);
    return {
      originalRequest: subject.request,
      responseId: subject.responseId,
    };
  } finally {
    await runtime.close();
  }
}

function isAcceptanceSubject(body: unknown): boolean {
  return JSON.stringify(body).includes("GUA06_SUBJECT_");
}

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

function responsePairCounts(body: unknown, callId: string): {
  calls: number;
  outputs: number;
} {
  const input = Array.isArray(asRecord(body)?.input)
    ? asRecord(body)!.input as unknown[]
    : [];
  const items = input.map(asRecord).filter((item): item is JsonObject => Boolean(item));
  return {
    calls: items.filter((item) => (
      item.type === "function_call" && item.call_id === callId
    )).length,
    outputs: items.filter((item) => (
      item.type === "function_call_output" && item.call_id === callId
    )).length,
  };
}

test("GUA-06 accepts estimator-driven Codex rebase through a real proxy restart", async () => {
  const environment = createTemporaryAcceptanceEnvironment("lightmem2-gua06-codex-");
  const sentinels = createAcceptanceSentinels(TEST_UUID);
  const upstream = new MockUpstreamRecorder();
  const estimator = await startLifecycleEstimator(sentinels);
  try {
    await upstream.start();
    const before = await runAcceptancePhase({
      phase: "before_restart",
      stateDir: environment.stateDir,
      upstream,
      estimatorBaseUrl: estimator.baseUrl,
      sentinels,
    });
    const beforeRegistry = await loadSessionTaskRegistry(environment.stateDir, SESSION_ID);
    const beforeTrace = await readFile(
      `${environment.stateDir}/event-trace.jsonl`,
      "utf8",
    );
    assert.equal(
      beforeRegistry.version,
      1,
      `${beforeTrace}\nestimator_errors=${JSON.stringify(estimator.errors)}`,
    );
    assert.equal(beforeRegistry.lastProcessedTurnSeq, 4);

    const after = await runAcceptancePhase({
      phase: "after_restart",
      stateDir: environment.stateDir,
      upstream,
      estimatorBaseUrl: estimator.baseUrl,
      sentinels,
      previousResponseId: before.responseId,
    });
    const afterRegistry = await loadSessionTaskRegistry(environment.stateDir, SESSION_ID);
    assert.equal(afterRegistry.version, 2);
    assert.equal(afterRegistry.lastProcessedTurnSeq, 9);
    assert.deepEqual(estimator.registryVersions, [0, 1]);

    const allRequests = upstream.requests();
    assert.equal(allRequests.length, 10);
    const afterRestartRequests = allRequests.filter((request) => (
      request.phase === "after_restart"
    ));
    assert.equal(afterRestartRequests.length, 5);
    assert.equal(
      asRecord(afterRestartRequests[0]?.body)?.previous_response_id,
      before.responseId,
    );
    const subjectRequests = allRequests.filter((request) => isAcceptanceSubject(request.body));
    assert.equal(subjectRequests.length, 2);
    assert.deepEqual(subjectRequests.map((request) => request.phase), [
      "before_restart",
      "after_restart",
    ]);
    assert.equal(subjectRequests.every((request) => (
      !Object.hasOwn(asRecord(request.body) ?? {}, "previous_response_id")
    )), true);
    for (const request of subjectRequests) {
      const serialized = JSON.stringify(request.body);
      const phase = request.phase;
      assert.equal(countOccurrences(serialized, `GUA06_SUBJECT_${phase}`), 1);
      assert.deepEqual(
        responsePairCounts(request.body, `call-gua06-${phase}-evict`),
        { calls: 0, outputs: 0 },
      );
      assert.deepEqual(
        responsePairCounts(request.body, `call-gua06-${phase}-keep`),
        { calls: 1, outputs: 1 },
      );
    }

    const summary = runAcceptanceHarness({
      sentinels,
      requests: subjectRequests,
      originalRequests: {
        before_restart: before.originalRequest,
        after_restart: after.originalRequest,
      },
    });
    assert.equal(summary.passed, true, JSON.stringify(summary));
    assert.equal(summary.requestCount, 2);
    assert.equal(summary.fallbackCount, 0);
    assert.equal(summary.fallbackSucceeded, false);
    assert.equal(summary.phases.every((phase) => phase.keepFound), true);
    assert.equal(summary.phases.every((phase) => !phase.evictFound), true);
    assert.equal(summary.phases.every((phase) => phase.toolClosure.complete), true);
    assert.equal(summary.phases.every((phase) => (
      phase.unsafeSuccessfulRequestSequences.length === 0
    )), true);
  } finally {
    await estimator.close();
    await upstream.close();
    environment.cleanup();
  }
});
