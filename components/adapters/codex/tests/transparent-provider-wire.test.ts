import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { reserveUnusedPort } from "@lightrsi/host-adapter";
import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { createConsoleLogger } from "../src/logger.js";
import { startCodexResponsesProxy } from "../src/proxy-runtime.js";

async function startWireUpstream(params: {
  path: string;
  body: string;
  contentType: string;
}) {
  const port = await reserveUnusedPort();
  const requests: string[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    requests.push(Buffer.concat(chunks).toString("utf8"));
    if (req.method !== "POST" || req.url !== params.path) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", params.contentType);
    res.end(params.body);
  });
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

async function startPureForwardProxy(upstreamBaseUrl: string) {
  const proxyPort = await reserveUnusedPort();
  const stateDir = await mkdtemp(`${tmpdir()}\\lightrsi-pure-forward-`);
  const config = normalizeTokenPilotCodexConfig({
    proxyPort,
    stateDir,
    upstream: {
      name: "capture",
      baseUrl: upstreamBaseUrl,
      wireApi: "responses",
    },
    proxyMode: { pureForward: true },
    modules: { stabilizer: false, reduction: false },
  });
  const runtime = await startCodexResponsesProxy({
    config,
    logger: createConsoleLogger(false),
  });
  return {
    runtime,
    cleanup: () => rm(stateDir, { recursive: true, force: true }),
  };
}

test("pure forward preserves unknown JSON fields on chat completions", async () => {
  const upstream = await startWireUpstream({
    path: "/v1/chat/completions",
    contentType: "application/json",
    body: '{"id":"chat_capture","unknown_response_field":{"keep":true}}',
  });
  const proxy = await startPureForwardProxy(upstream.baseUrl);
  try {
    const requestBody = JSON.stringify({
      model: "capture-model",
      stream: false,
      unknown_request_field: { keep: true },
      messages: [{ role: "user", content: "hello" }],
    });
    const response = await fetch(`${proxy.runtime.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody,
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '{"id":"chat_capture","unknown_response_field":{"keep":true}}');
    assert.deepEqual(upstream.requests, [requestBody]);
  } finally {
    await proxy.runtime.close();
    await proxy.cleanup();
    await upstream.close();
  }
});

test("pure forward preserves SSE bytes and content type", async () => {
  const streamBody = "event: response.created\ndata: {\"id\":\"resp_capture\"}\n\nevent: response.completed\ndata: {}\n\n";
  const upstream = await startWireUpstream({
    path: "/v1/responses",
    contentType: "text/event-stream",
    body: streamBody,
  });
  const proxy = await startPureForwardProxy(upstream.baseUrl);
  try {
    const requestBody = JSON.stringify({
      model: "capture-model",
      stream: true,
      input: [{ role: "user", content: "hello" }],
      unknown_request_field: [1, 2, 3],
    });
    const response = await fetch(`${proxy.runtime.baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody,
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    assert.equal(await response.text(), streamBody);
    assert.deepEqual(upstream.requests, [requestBody]);
  } finally {
    await proxy.runtime.close();
    await proxy.cleanup();
    await upstream.close();
  }
});
