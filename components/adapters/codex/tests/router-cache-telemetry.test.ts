import assert from "node:assert/strict";
import test from "node:test";

import {
  collectRouterCacheTelemetry,
  computeSafeGatewayEndpointDigest,
} from "../src/router-cache-telemetry.js";

test("safe gateway digest treats 9Router endpoint forms as one gateway", () => {
  const first = computeSafeGatewayEndpointDigest("http://127.0.0.1:20128");
  const second = computeSafeGatewayEndpointDigest("http://127.0.0.1:20128/v1");
  const third = computeSafeGatewayEndpointDigest("http://user:secret@127.0.0.1:20128/v1/responses?token=secret");

  assert.equal(first, second);
  assert.equal(second, third);
  assert.match(first, /^sha256:[0-9a-f]{64}$/);
  assert.doesNotMatch(first, /secret|20128/);
});

test("telemetry exposes configured gateway without claiming internal route proof", () => {
  const telemetry = collectRouterCacheTelemetry({
    headers: {},
    upstreamName: "9Router",
    upstreamBaseUrl: "http://127.0.0.1:20128/v1",
    responseModel: "cx/gpt-5.6-sol",
    usage: { input_tokens: 10, cached_input_tokens: 8 },
  });

  assert.equal(telemetry.status, "observed");
  assert.equal(telemetry.routeIdentitySource, "configured_endpoint");
  assert.equal(telemetry.routeId, null);
  assert.equal(telemetry.provider, null);
  assert.equal(telemetry.configuredGateway, "9Router");
  assert.match(telemetry.configuredEndpointDigest ?? "", /^sha256:[0-9a-f]{64}$/);
  assert.equal(telemetry.resolvedModel, "cx/gpt-5.6-sol");
});

test("telemetry upgrades identity source when 9Router headers are present", () => {
  const telemetry = collectRouterCacheTelemetry({
    headers: {
      "x-9router-route-id": "route-a",
      "x-9router-provider": "provider-a",
    },
    upstreamName: "9Router",
    upstreamBaseUrl: "http://127.0.0.1:20128/v1",
  });

  assert.equal(telemetry.routeIdentitySource, "router_headers");
  assert.equal(telemetry.routeId, "route-a");
  assert.equal(telemetry.provider, "provider-a");
});