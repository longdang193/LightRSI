import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  requestUpstreamResponses,
  requestUpstreamResponsesStream,
  resolveModelFromCatalog,
} from "../src/upstream.js";

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

test("upstream retries up to twice when requested encrypted reasoning is omitted", async () => {
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
    assert.equal(requestCount(), 3);
    assert.match(response.text, /opaque-retry-state/);
  });
});

test("upstream encrypted-reasoning repair is bounded to two retries", async () => {
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
    assert.equal(requestCount(), 3);
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
