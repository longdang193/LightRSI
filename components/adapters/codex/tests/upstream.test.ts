import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  requestUpstreamResponses,
  requestUpstreamResponsesStream,
  resetCompactCapabilityCache,
  resolveModelFromCatalog,
} from "../src/upstream.js";
import { drainEventTraceQueue as drainTraceQueue } from "@lightrsi/host-adapter";

test("model catalog resolver handles qualified, unique, unknown, and ambiguous names uniformly", () => {
  const catalog = [
    "combo-high",
    "cx/gpt-5.6-sol",
    "cx/gpt-5.6-terra",
    "ds/deepseek-chat",
    "other/deepseek-chat",
  ];

  assert.equal(resolveModelFromCatalog("cx/gpt-5.6-sol", catalog), "cx/gpt-5.6-sol");
  assert.equal(resolveModelFromCatalog("gpt-5.6-sol", catalog), "cx/gpt-5.6-sol");
  assert.equal(resolveModelFromCatalog("combo-high", catalog), "combo-high");
  assert.throws(
    () => resolveModelFromCatalog("missing-model", catalog),
    /no model matching "missing-model"/i,
  );
  assert.throws(
    () => resolveModelFromCatalog("deepseek-chat", catalog),
    /ambiguous matches.*ds\/deepseek-chat.*other\/deepseek-chat/i,
  );
});

async function withReasoningFixture(
  responses: Array<{ encrypted?: string }>,
  run: (baseUrl: string, requestCount: () => number) => Promise<void>,
): Promise<void> {
  let count = 0;
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) {
      // Drain the request body before replying.
    }
    const fixture = responses[Math.min(count, responses.length - 1)] ?? {};
    count += 1;
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      id: `resp-${count}`,
      status: "completed",
      output: [{
        type: "reasoning",
        encrypted_content: fixture.encrypted,
        summary: [],
      }],
    }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  try {
    await run(`http://127.0.0.1:${address.port}/v1`, () => count);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("upstream does not regenerate successful responses when encrypted reasoning is omitted", async () => {
  await withReasoningFixture([{}, {}, { encrypted: "opaque-retry-state" }], async (baseUrl, requestCount) => {
    const response = await requestUpstreamResponses({
      upstream: { baseUrl, wireApi: "responses", requiresOpenAIAuth: false },
      payload: {
        model: "gpt-fixture",
        store: false,
        include: ["reasoning.encrypted_content"],
        input: [{ role: "user", content: "test" }],
      },
    });
    assert.equal(response.status, 200);
    assert.equal(requestCount(), 1);
    assert.equal(response.transportFetches, 1);
    assert.doesNotMatch(response.text, /opaque-retry-state/);
  });
});

test("upstream reports one fetch when encrypted reasoning remains absent", async () => {
  await withReasoningFixture([{}, {}, {}], async (baseUrl, requestCount) => {
    const response = await requestUpstreamResponses({
      upstream: { baseUrl, wireApi: "responses", requiresOpenAIAuth: false },
      payload: {
        model: "gpt-fixture",
        include: ["reasoning.encrypted_content"],
        input: [{ role: "user", content: "test" }],
      },
    });
    assert.equal(response.status, 200);
    assert.equal(requestCount(), 1);
    assert.equal(response.transportFetches, 1);
    assert.doesNotMatch(response.text, /encrypted_content":"opaque/);
  });
});

test("upstream forwards the versioned LightRSI cache contract boundary", async () => {
  let receivedContract: string | undefined;
  const server = createServer(async (req, res) => {
    receivedContract = req.headers["x-lightrsi-cache-contract"] as string | undefined;
    for await (const _chunk of req) {
      // Drain request body before replying.
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ status: "completed", output: [] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  try {
    const response = await requestUpstreamResponses({
      upstream: { baseUrl: `http://127.0.0.1:${address.port}/v1`, wireApi: "responses", requiresOpenAIAuth: false },
      payload: { model: "gpt-fixture", input: [{ role: "user", content: "test" }] },
      lightmem2CacheContractDigest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
    assert.equal(response.status, 200);
    assert.equal(receivedContract, "v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("expired unsupported-field capability records allow one bounded retry", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-codex-capability-expiry-"));
  let requests: Array<Record<string, unknown>> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    requests.push(payload);
    if ("prompt_cache_retention" in payload) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: { message: "Unsupported parameter: prompt_cache_retention" } }));
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ status: "completed", output: [] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  const endpoint = `${baseUrl}/responses`;
  try {
    await mkdir(join(stateDir, "upstream-capabilities", "responses"), { recursive: true });
    await writeFile(
      join(stateDir, "upstream-capabilities", "responses", `${encodeURIComponent(endpoint)}.json`),
      JSON.stringify({
        endpoint,
        unsupportedOptionalFields: ["prompt_cache_retention"],
        updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      }),
      "utf8",
    );
    const response = await requestUpstreamResponses({
      upstream: { baseUrl, wireApi: "responses", requiresOpenAIAuth: false },
      payload: {
        model: "gpt-fixture",
        prompt_cache_retention: "24h",
        input: [{ role: "user", content: "test" }],
      },
      stateDir,
    });
    assert.equal(response.status, 200);
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.prompt_cache_retention, "24h");
    assert.equal("prompt_cache_retention" in (requests[1] ?? {}), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("unsupported prompt_cache_options is persisted and retried once without that field", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-codex-cache-options-capability-"));
  const requests: Array<Record<string, unknown>> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    requests.push(payload);
    if ("prompt_cache_options" in payload) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: { message: "Unsupported parameter: prompt_cache_options" } }));
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ status: "completed", output: [] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  try {
    const response = await requestUpstreamResponses({
      upstream: { baseUrl: `http://127.0.0.1:${address.port}/v1`, wireApi: "responses", requiresOpenAIAuth: false },
      payload: {
        model: "gpt-fixture",
        prompt_cache_options: { mode: "explicit", ttl: "30m" },
        input: [{ role: "user", content: "test" }],
      },
      stateDir,
    });
    assert.equal(response.status, 200);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0]?.prompt_cache_options, { mode: "explicit", ttl: "30m" });
    assert.equal("prompt_cache_options" in (requests[1] ?? {}), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("compact fallback keeps normalized payload through unsupported-field retry", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-codex-compact-fallback-retry-"));
  const requests: Array<{ path: string; payload: Record<string, unknown> }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    if (req.url === "/v1/models") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "provider/json-model" }, { id: "provider/stream-model" }] }));
      return;
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    requests.push({ path: req.url ?? "", payload });
    if (req.url === "/v1/responses/compact") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    if ("prompt_cache_retention" in payload) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: { message: "Unsupported parameter: prompt_cache_retention" } }));
      return;
    }
    res.statusCode = 200;
    if (payload.stream === true) {
      res.setHeader("content-type", "text/event-stream");
      res.end("event: response.completed\n\n");
    } else {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ status: "completed", output: [] }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  const upstream = {
    name: "9router",
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    wireApi: "responses" as const,
    requiresOpenAIAuth: false,
  };
  const fallbackPayload = (payload: any) => ({
    ...payload,
    input: Array.isArray(payload.input)
      ? payload.input.filter((item: any) => item?.type !== "web_search_call")
      : payload.input,
  });
  try {
    const json = await requestUpstreamResponses({
      upstream,
      stateDir,
      endpointPath: "/responses/compact",
      payload: {
        model: "json-model",
        prompt_cache_retention: "24h",
        input: [{ type: "web_search_call", id: "search_json" }],
      },
      fallbackPayload,
    });
    assert.equal(json.status, 200);
    assert.equal(json.transportFetches, 3);
    assert.equal(json.attempts.length, 3);
    assert.equal(json.attempts[0]?.responseProducing, false);
    assert.equal(json.finalAttempt?.responseProducing, true);
    assert.equal(json.finalAttempt?.kind, "unsupported_retry");

    const stream = await requestUpstreamResponsesStream({
      upstream,
      stateDir,
      endpointPath: "/responses/compact",
      payload: {
        model: "stream-model",
        prompt_cache_retention: "24h",
        stream: true,
        input: [{ type: "web_search_call", id: "search_stream" }],
      },
      fallbackPayload,
    });
    for await (const _chunk of stream.stream) {
    }
    assert.equal(stream.status, 200);
    assert.equal(stream.transportFetches, 3);
    assert.equal(stream.attempts.length, 3);
    assert.equal(stream.attempts[0]?.responseProducing, false);
    assert.equal(stream.finalAttempt?.responseProducing, true);
    assert.equal(stream.finalAttempt?.kind, "unsupported_retry");

    for (const offset of [0, 3]) {
      assert.equal(requests[offset]?.path, "/v1/responses/compact");
      assert.equal(requests[offset + 1]?.path, "/v1/responses");
      assert.equal(requests[offset + 2]?.path, "/v1/responses");
      assert.equal(requests[offset + 1]?.payload.model, `provider/${offset === 0 ? "json-model" : "stream-model"}`);
      assert.equal(requests[offset + 2]?.payload.model, requests[offset + 1]?.payload.model);
      assert.equal((requests[offset + 1]?.payload.input as any[])?.some((item) => item?.type === "web_search_call"), false);
      assert.equal((requests[offset + 2]?.payload.input as any[])?.some((item) => item?.type === "web_search_call"), false);
      assert.equal("prompt_cache_retention" in (requests[offset + 1]?.payload ?? {}), true);
      assert.equal("prompt_cache_retention" in (requests[offset + 2]?.payload ?? {}), false);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("stream upstream learns unsupported nested prompt_cache_breakpoint and retries without it", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-codex-breakpoint-capability-"));
  const requests: Array<Record<string, unknown>> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    requests.push(payload);
    const input = Array.isArray(payload.input) ? payload.input : [];
    const hasBreakpoint = input.some((item: any) => Array.isArray(item?.content)
      && item.content.some((block: any) => block?.prompt_cache_breakpoint));
    if (hasBreakpoint) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: {
        message: "Unsupported parameter: input[0].content[1].prompt_cache_breakpoint",
      } }));
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "text/event-stream");
    res.end("event: response.completed\n\n");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  const payload = {
    model: "gpt-5.6-luna",
    input: [{
      role: "developer",
      content: [
        { type: "input_text", text: "stable" },
        { type: "input_text", text: "boundary", prompt_cache_breakpoint: { mode: "explicit" } },
      ],
    }],
  };
  try {
    const first = await requestUpstreamResponsesStream({
      upstream: { baseUrl: `http://127.0.0.1:${address.port}/v1`, wireApi: "responses", requiresOpenAIAuth: false },
      payload,
      stateDir,
    });
    for await (const _chunk of first.stream) {
    }
    assert.equal(first.status, 200);
    assert.equal(requests.length, 2);
    assert.ok((requests[0]?.input as any[])?.[0]?.content?.[1]?.prompt_cache_breakpoint);
    assert.equal((requests[1]?.input as any[])?.[0]?.content?.[1]?.prompt_cache_breakpoint, undefined);

    const second = await requestUpstreamResponsesStream({
      upstream: { baseUrl: `http://127.0.0.1:${address.port}/v1`, wireApi: "responses", requiresOpenAIAuth: false },
      payload,
      stateDir,
    });
    for await (const _chunk of second.stream) {
    }
    assert.equal(second.status, 200);
    assert.equal(requests.length, 3);
    assert.equal((requests[2]?.input as any[])?.[0]?.content?.[1]?.prompt_cache_breakpoint, undefined);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("stream breakpoint downgrade bypasses 9Router negative cache", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-codex-breakpoint-negative-cache-"));
  const requests: Array<Record<string, unknown>> = [];
  const cooldownUntil = new Map<string, number>();
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    requests.push(payload);
    const input = Array.isArray(payload.input) ? payload.input : [];
    const hasBreakpoint = input.some((item: any) => Array.isArray(item?.content)
      && item.content.some((block: any) => block?.prompt_cache_breakpoint));
    const cacheKey = typeof payload.prompt_cache_key === "string" ? payload.prompt_cache_key : "";
    if (hasBreakpoint || (cooldownUntil.get(cacheKey) ?? 0) > Date.now()) {
      if (hasBreakpoint) cooldownUntil.set(cacheKey, Date.now() + 50);
      res.statusCode = 400;
      res.end(JSON.stringify({ error: {
        message: '[codex/gpt-5.6-luna] [400]: {"error":{"message":"prompt_cache_breakpoint is not supported on this model"}} (reset after 0s)',
      } }));
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "text/event-stream");
    res.end("event: response.completed\n\n");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  const payload = {
    model: "gpt-5.6-luna",
    prompt_cache_key: "stable-key",
    prompt_cache_options: { mode: "explicit", ttl: "30m" },
    input: [{
      role: "developer",
      content: [{ type: "input_text", text: "stable", prompt_cache_breakpoint: { mode: "explicit" } }],
    }],
  };
  try {
    const first = await requestUpstreamResponsesStream({
      upstream: { baseUrl: `http://127.0.0.1:${address.port}/v1`, wireApi: "responses", requiresOpenAIAuth: false },
      payload,
      stateDir,
    });
    for await (const _chunk of first.stream) {
    }
    assert.equal(first.status, 200);
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.prompt_cache_key, "stable-key");
    assert.equal(requests[1]?.prompt_cache_key, "stable-key");

    const second = await requestUpstreamResponsesStream({
      upstream: { baseUrl: `http://127.0.0.1:${address.port}/v1`, wireApi: "responses", requiresOpenAIAuth: false },
      payload,
      stateDir,
    });
    for await (const _chunk of second.stream) {
    }
    assert.equal(second.status, 200);
    assert.equal(requests.length, 3);
    assert.equal(requests[2]?.prompt_cache_key, "stable-key");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("upstream resolves bare 9Router model names from its live catalog", async () => {
  let forwardedModel: string | undefined;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const _chunk of req) {
      chunks.push(Buffer.isBuffer(_chunk) ? _chunk : Buffer.from(String(_chunk)));
    }
    if (req.url === "/v1/models") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "cx/gpt-5.6-sol" }] }));
      return;
    }
    forwardedModel = (JSON.parse(Buffer.concat(chunks).toString("utf8")) as { model?: string }).model;
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ status: "completed", output: [] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  try {
    const response = await requestUpstreamResponses({
      upstream: {
        name: "9Router",
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        wireApi: "responses",
        requiresOpenAIAuth: false,
      },
      payload: { model: "gpt-5.6-sol", input: [{ role: "user", content: "test" }] },
    });
    assert.equal(response.status, 200);
    assert.equal(forwardedModel, "cx/gpt-5.6-sol");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("upstream adapts successful Chat Completions JSON into Responses JSON", async () => {
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) {
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      id: "chatcmpl-fixture",
      object: "chat.completion",
      created: 1780000000,
      model: "fixture-model",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "OK",
          tool_calls: [{
            id: "call_fixture",
            type: "function",
            function: { name: "read_file", arguments: "{\"path\":\"package.json\"}" },
          }],
        },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  try {
    const response = await requestUpstreamResponses({
      upstream: { baseUrl: `http://127.0.0.1:${address.port}/v1`, wireApi: "responses", requiresOpenAIAuth: false },
      payload: { model: "fixture-model", input: [{ role: "user", content: "test" }] },
    });
    const body = JSON.parse(response.text) as Record<string, any>;
    assert.equal(response.status, 200);
    assert.equal(body.object, "response");
    assert.equal(body.output[0].type, "message");
    assert.equal(body.output[0].content[0].text, "OK");
    assert.equal(body.output[1].type, "function_call");
    assert.equal(body.output[1].call_id, "call_fixture");
    assert.equal(body.output[1].name, "read_file");
    assert.equal(body.output[1].arguments, '{"path":"package.json"}');
    assert.equal(body.usage.input_tokens, 3);
    assert.equal(body.usage.output_tokens, 2);
    assert.equal(body.usage.total_tokens, 5);
    assert.equal("prompt_tokens" in body.usage, false);
    assert.equal("completion_tokens" in body.usage, false);
    assert.equal("choices" in body, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("upstream traces correlated HTTP responses without provider secrets", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-codex-upstream-trace-response-"));
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) {
    }
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: { message: "provider unavailable" } }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  try {
    const response = await requestUpstreamResponses({
      requestId: "upstream-response-trace",
      stateDir,
      upstream: {
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        apiKey: "provider-secret",
        wireApi: "responses",
        requiresOpenAIAuth: false,
      },
      payload: { model: "gpt-fixture", input: [{ role: "user", content: "test" }] },
    });
    assert.equal(response.status, 503);
    await drainTraceQueue();
    const rows = (await readFile(join(stateDir, "event-trace.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const trace = rows.find((entry) => entry.stage === "upstream_response");
    assert.equal(trace?.requestId, "upstream-response-trace");
    assert.equal(trace?.status, 503);
    assert.equal(trace?.model, "gpt-fixture");
    assert.match(String(trace?.upstreamEndpointId), /^sha256:/);
    assert.equal(trace?.stream, false);
    assert.doesNotMatch(JSON.stringify(trace), /secret|api_key|user:/i);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("upstream traces correlated transport errors with sanitized messages", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-codex-upstream-trace-error-"));
  const port = await new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
      server.close(() => resolve(address.port));
    });
  });
  try {
    await assert.rejects(
      requestUpstreamResponses({
        requestId: "upstream-transport-trace",
        stateDir,
        upstream: {
          baseUrl: `http://127.0.0.1:${port}/v1`,
          apiKey: "provider-secret",
          wireApi: "responses",
          requiresOpenAIAuth: false,
        },
        payload: { model: "gpt-fixture", input: [{ role: "user", content: "test" }] },
      }),
    );
    await drainTraceQueue();
    const rows = (await readFile(join(stateDir, "event-trace.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const trace = rows.find((entry) => entry.stage === "upstream_transport_error");
    assert.equal(trace?.requestId, "upstream-transport-trace");
    assert.equal(trace?.status, null);
    assert.equal(typeof trace?.errorClass, "string");
    assert.equal(typeof trace?.errorMessage, "string");
    assert.doesNotMatch(JSON.stringify(trace), /secret|api_key|user:/i);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("compact capability shares unsupported fallback across JSON and stream requests", async () => {
  resetCompactCapabilityCache();
  const paths: string[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    paths.push(req.url ?? "");
    if (req.url === "/v1/responses/compact") {
      res.statusCode = 404;
      res.end("unsupported");
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", req.headers.accept === "text/event-stream" ? "text/event-stream" : "application/json");
    res.end(req.headers.accept === "text/event-stream" ? "event: response.completed\ndata: [DONE]\n\n" : JSON.stringify({ status: "completed", output: [] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  const upstream = { baseUrl: `http://127.0.0.1:${address.port}/v1`, wireApi: "responses" as const, requiresOpenAIAuth: false };
  const fallbackPayload = (payload: any) => ({ ...payload, fallback: true });
  try {
    const json = await requestUpstreamResponses({
      upstream,
      endpointPath: "/responses/compact",
      payload: { model: "shared-model" },
      fallbackPayload,
    });
    const stream = await requestUpstreamResponsesStream({
      upstream,
      endpointPath: "/responses/compact",
      payload: { model: "shared-model", stream: true },
      fallbackPayload,
    });
    for await (const _chunk of stream.stream) {
    }
    assert.equal(json.transportFetches, 2);
    assert.equal(stream.transportFetches, 1);
    assert.deepEqual(paths, [
      "/v1/responses/compact",
      "/v1/responses",
      "/v1/responses",
    ]);
  } finally {
    resetCompactCapabilityCache();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("compact capability shares supported native path across JSON and stream requests", async () => {
  resetCompactCapabilityCache();
  const paths: string[] = [];
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) {
    }
    paths.push(req.url ?? "");
    res.statusCode = 200;
    res.setHeader("content-type", req.headers.accept === "text/event-stream" ? "text/event-stream" : "application/json");
    res.end(req.headers.accept === "text/event-stream" ? "event: response.completed\ndata: [DONE]\n\n" : JSON.stringify({ status: "completed", output: [] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  const upstream = { baseUrl: `http://127.0.0.1:${address.port}/v1`, wireApi: "responses" as const, requiresOpenAIAuth: false };
  try {
    const json = await requestUpstreamResponses({
      upstream,
      endpointPath: "/responses/compact",
      payload: { model: "supported-model" },
    });
    const stream = await requestUpstreamResponsesStream({
      upstream,
      endpointPath: "/responses/compact",
      payload: { model: "supported-model", stream: true },
    });
    for await (const _chunk of stream.stream) {
    }
    assert.equal(json.transportFetches, 1);
    assert.equal(stream.transportFetches, 1);
    assert.deepEqual(paths, ["/v1/responses/compact", "/v1/responses/compact"]);
  } finally {
    resetCompactCapabilityCache();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("compact capability does not cache non-404 failures and reset forces reprobe", async () => {
  resetCompactCapabilityCache();
  let compactRequests = 0;
  const statuses = [400, 401, 403, 500];
  const server = createServer(async (_req, res) => {
    compactRequests += 1;
    res.statusCode = statuses[Math.min(Math.floor((compactRequests - 1) / 2), statuses.length - 1)]!;
    res.end("failure");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  const upstream = { baseUrl: `http://127.0.0.1:${address.port}/v1`, wireApi: "responses" as const, requiresOpenAIAuth: false };
  try {
    for (const expectedStatus of statuses) {
      const first = await requestUpstreamResponses({ upstream, endpointPath: "/responses/compact", payload: { model: "failure-model" } });
      const second = await requestUpstreamResponses({ upstream, endpointPath: "/responses/compact", payload: { model: "failure-model" } });
      assert.equal(first.status, expectedStatus);
      assert.equal(second.status, expectedStatus);
    }
    assert.equal(compactRequests, statuses.length * 2);
    resetCompactCapabilityCache();
    const afterReset = await requestUpstreamResponses({ upstream, endpointPath: "/responses/compact", payload: { model: "failure-model" } });
    assert.equal(afterReset.status, 500);
    assert.equal(compactRequests, statuses.length * 2 + 1);
  } finally {
    resetCompactCapabilityCache();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("stale compact probe cannot overwrite reset generation", async () => {
  resetCompactCapabilityCache();
  let compactRequests = 0;
  let releaseFirst!: () => void;
  let firstSeen!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const firstRequest = new Promise<void>((resolve) => { firstSeen = resolve; });
  const server = createServer(async (req, res) => {
    if (req.url === "/v1/responses/compact") {
      compactRequests += 1;
      if (compactRequests === 1) {
        firstSeen();
        await firstGate;
        res.statusCode = 404;
        res.end("unsupported");
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ status: "completed", output: [] }));
      return;
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ status: "completed", output: [] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  const upstream = { baseUrl: `http://127.0.0.1:${address.port}/v1`, wireApi: "responses" as const, requiresOpenAIAuth: false };
  try {
    const first = requestUpstreamResponses({ upstream, endpointPath: "/responses/compact", payload: { model: "race-model" } });
    await firstRequest;
    resetCompactCapabilityCache();
    const second = await requestUpstreamResponses({ upstream, endpointPath: "/responses/compact", payload: { model: "race-model" } });
    releaseFirst();
    const firstResult = await first;
    const third = await requestUpstreamResponses({ upstream, endpointPath: "/responses/compact", payload: { model: "race-model" } });
    assert.equal(second.status, 200);
    assert.equal(firstResult.status, 200);
    assert.equal(third.status, 200);
    assert.equal(compactRequests, 3);
  } finally {
    resetCompactCapabilityCache();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("compact capability expires and evicts oldest entries", async () => {
  resetCompactCapabilityCache();
  let compactRequests = 0;
  const server = createServer(async (_req, res) => {
    compactRequests += 1;
    res.statusCode = 200;
    res.end(JSON.stringify({ status: "completed", output: [] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind a port");
  const upstream = { baseUrl: `http://127.0.0.1:${address.port}/v1`, wireApi: "responses" as const, requiresOpenAIAuth: false };
  const originalNow = Date.now;
  try {
    await requestUpstreamResponses({ upstream, endpointPath: "/responses/compact", payload: { model: "ttl-model" } });
    Date.now = () => originalNow() + 24 * 60 * 60 * 1000 + 1;
    await requestUpstreamResponses({ upstream, endpointPath: "/responses/compact", payload: { model: "ttl-model" } });
    Date.now = originalNow;
    for (let index = 0; index < 65; index += 1) {
      await requestUpstreamResponses({ upstream, endpointPath: "/responses/compact", payload: { model: `eviction-model-${index}` } });
    }
    await requestUpstreamResponses({ upstream, endpointPath: "/responses/compact", payload: { model: "eviction-model-0" } });
    assert.equal(compactRequests, 68);
  } finally {
    Date.now = originalNow;
    resetCompactCapabilityCache();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
