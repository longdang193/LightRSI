import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { requestUpstreamResponses, resolveModelFromCatalog } from "../src/upstream.js";

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

test("upstream forwards the versioned LightMem2 cache contract boundary", async () => {
  let receivedContract: string | undefined;
  const server = createServer(async (req, res) => {
    receivedContract = req.headers["x-lightmem2-cache-contract"] as string | undefined;
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
