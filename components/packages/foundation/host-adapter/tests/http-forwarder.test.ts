import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { buildGatewayForwardHeaders } from "../src/gateway/http-forwarder.js";
import { readHttpRequestBody } from "../src/gateway/http-server.js";

test("forward headers omit transport metadata that can split provider cache identity", () => {
  const headers = buildGatewayForwardHeaders({
    upstream: { baseUrl: "http://provider.test/v1", apiKey: "key", name: "provider", protocol: "custom" },
    inboundHeaders: {
      accept: "text/event-stream",
      "accept-language": "en-US",
      authorization: "Bearer inbound",
      "content-type": "application/json",
      "keep-alive": "timeout=5",
      "proxy-authorization": "Basic local-proxy-secret",
      "sec-fetch-mode": "cors",
      te: "trailers",
      "user-agent": "browser",
      "upgrade": "websocket",
      "x-api-key": "inbound-key",
      "x-request-id": "request",
      "x-lightmem2-cache-contract": "internal",
    },
  });

  assert.deepEqual(headers, {
    accept: "text/event-stream",
    authorization: "Bearer key",
    "content-type": "application/json",
    "x-request-id": "request",
  });
});

test("forward headers preserve inbound authorization only without an explicit upstream key", () => {
  const headers = buildGatewayForwardHeaders({
    upstream: { baseUrl: "http://provider.test/v1", protocol: "custom" },
    inboundAuthorization: "Bearer inbound",
    inboundHeaders: { authorization: "Bearer inbound" },
  });
  assert.equal(headers.authorization, "Bearer inbound");
});

test("aborted body reads fail before consuming request data", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readHttpRequestBody(Readable.from([]) as unknown as import("node:http").IncomingMessage, controller.signal),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});
