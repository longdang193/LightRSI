import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  reserveUnusedPort,
  startMockCachingJsonUpstream,
  startMockJsonUpstream,
} from "@lightrsi/host-adapter";
import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { createConsoleLogger } from "../src/logger.js";
import { startCodexResponsesProxy } from "../src/proxy-runtime.js";

async function startSseUpstream(options: { compactStatus?: number } = {}) {
  const port = await reserveUnusedPort();
  const requests: Array<Record<string, unknown>> = [];
  const paths: string[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    if (req.method !== "POST" || !["/v1/responses", "/v1/responses/compact"].includes(req.url ?? "")) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    paths.push(req.url ?? "");
    if (req.url === "/v1/responses/compact" && options.compactStatus !== undefined && options.compactStatus !== 200) {
      res.statusCode = options.compactStatus;
      res.end("not found");
      return;
    }
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
    res.statusCode = 200;
    res.setHeader("content-type", "text/event-stream");
    res.end([
      `event: response.created\ndata: ${JSON.stringify({
        type: "response.created",
        response: { id: "resp_compact_stream", object: "response", status: "in_progress" },
      })}`,
      `event: response.completed\ndata: ${JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_compact_stream",
          object: "response",
          status: "completed",
          output: req.url === "/v1/responses/compact" ? [{ type: "compaction", id: "cmp_1" }] : [],
        },
      })}`,
      "",
      "",
    ].join("\n"));
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
    paths,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("compact route strips historical web search items on request-only projection", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-compact-route-"));
  const proxyPort = await reserveUnusedPort();
  const upstream = await startMockJsonUpstream({
    responseBody: {
      id: "resp_compact_test",
      object: "response",
      status: "completed",
      output: [],
    },
  });
  const runtime = await startCodexResponsesProxy({
    config: normalizeTokenPilotCodexConfig({
      proxyPort,
      stateDir,
      upstream: { name: "capture", baseUrl: upstream.baseUrl, wireApi: "responses" },
      proxyMode: { pureForward: false },
      modules: { stabilizer: false, reduction: false },
      contextRewrite: { enabled: false },
    }),
    logger: createConsoleLogger(false),
  });

  try {
    const response = await fetch(`${runtime.baseUrl}/responses/compact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "capture-model",
        stream: false,
        input: [
          { type: "message", role: "user", content: [{ type: "input_text", text: "compact" }] },
          { type: "web_search_call", id: "search_1", status: "completed" },
        ],
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(upstream.requests.length, 1);
    assert.equal(upstream.requests[0]?.input?.some((item: any) => item?.type === "web_search_call"), false);
  } finally {
    await runtime.close();
    await upstream.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("compact stream route preserves history and native completion SSE", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-compact-stream-"));
  const proxyPort = await reserveUnusedPort();
  const upstream = await startSseUpstream();
  const runtime = await startCodexResponsesProxy({
    config: normalizeTokenPilotCodexConfig({
      proxyPort,
      stateDir,
      upstream: { name: "capture", baseUrl: upstream.baseUrl, wireApi: "responses" },
      proxyMode: { pureForward: false },
      modules: { stabilizer: false, reduction: false },
      contextRewrite: { enabled: false },
    }),
    logger: createConsoleLogger(false),
  });

  try {
    const response = await fetch(`${runtime.baseUrl}/responses/compact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "capture-model",
        stream: true,
        input: [
          { type: "message", role: "user", content: [{ type: "input_text", text: "compact" }] },
          { type: "web_search_call", id: "search_1", status: "completed" },
        ],
      }),
    });

    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(text, /event: response\.completed/);
    assert.equal(upstream.requests.length, 1);
    assert.deepEqual(upstream.paths, ["/v1/responses/compact"]);
    assert.match(text, /"type":"compaction"/);
    assert.equal(upstream.requests[0]?.input?.some((item: any) => item?.type === "web_search_call"), true);
  } finally {
    await runtime.close();
    await upstream.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("compact route falls back when upstream lacks compact endpoint", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-compact-fallback-"));
  const proxyPort = await reserveUnusedPort();
  const upstream = await startSseUpstream({ compactStatus: 404 });
  const runtime = await startCodexResponsesProxy({
    config: normalizeTokenPilotCodexConfig({
      proxyPort,
      stateDir,
      upstream: { name: "capture", baseUrl: upstream.baseUrl, wireApi: "responses" },
      proxyMode: { pureForward: false },
      modules: { stabilizer: false, reduction: false },
      contextRewrite: { enabled: false },
    }),
    logger: createConsoleLogger(false),
  });

  try {
    const response = await fetch(`${runtime.baseUrl}/responses/compact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "capture-model",
        stream: true,
        input: [{ type: "web_search_call", id: "search_1", status: "completed" }],
      }),
    });
    assert.equal(response.status, 200);
    await response.text();
    assert.deepEqual(upstream.paths, ["/v1/responses/compact", "/v1/responses"]);
    assert.equal(upstream.requests[0]?.input?.some((item: any) => item?.type === "web_search_call"), false);
  } finally {
    await runtime.close();
    await upstream.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("compact route keeps same-thread continuation and normal-route history", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-compact-continuation-"));
  const proxyPort = await reserveUnusedPort();
  const upstream = await startMockCachingJsonUpstream({
    responseFactory: (_request, index) => ({
      id: `resp_compact_continuation_${index + 1}`,
      object: "response",
      status: "completed",
      output: [],
    }),
  });
  const runtime = await startCodexResponsesProxy({
    config: normalizeTokenPilotCodexConfig({
      proxyPort,
      stateDir,
      upstream: { name: "capture", baseUrl: upstream.baseUrl, wireApi: "responses" },
      proxyMode: { pureForward: false },
      modules: { stabilizer: false, reduction: false },
      contextRewrite: { enabled: false },
    }),
    logger: createConsoleLogger(false),
  });

  try {
    const first = await fetch(`${runtime.baseUrl}/responses/compact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "capture-model",
        stream: false,
        input: [
          { type: "message", role: "user", content: [{ type: "input_text", text: "compact" }] },
          { type: "web_search_call", id: "search_1", status: "completed" },
        ],
      }),
    });
    const firstBody = await first.json() as { id: string };

    const second = await fetch(`${runtime.baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "capture-model",
        stream: false,
        previous_response_id: firstBody.id,
        input: [{ type: "web_search_call", id: "search_2", status: "completed" }],
      }),
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(upstream.requests.length, 2);
    assert.equal(upstream.requests[0]?.input?.some((item: any) => item?.type === "web_search_call"), false);
    assert.equal(upstream.requests[1]?.previous_response_id, firstBody.id);
    assert.equal(upstream.requests[1]?.input?.some((item: any) => item?.type === "web_search_call"), true);
  } finally {
    await runtime.close();
    await upstream.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});
