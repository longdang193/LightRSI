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
      "sec-fetch-mode": "cors",
      "user-agent": "browser",
      "x-request-id": "request",
      "x-lightmem2-cache-contract": "internal",
    },
  });

  assert.deepEqual(headers, {
    accept: "text/event-stream",
    authorization: "Bearer inbound",
    "content-type": "application/json",
    "x-request-id": "request",
  });
});

test("aborted body reads fail before consuming request data", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readHttpRequestBody(Readable.from([]) as unknown as import("node:http").IncomingMessage, controller.signal),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});
