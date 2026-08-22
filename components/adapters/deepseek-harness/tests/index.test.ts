import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { apply, inject, name } from "../src/index.js";
import type { DshPluginContext } from "../src/types.js";

function mockCtx(): { ctx: DshPluginContext; events: string[] } {
  const events: string[] = [];
  const ctx: DshPluginContext = {
    on: (event) => { events.push(event); },
    tokenMeter: { measure: () => ({}) },
  };
  return { ctx, events };
}

const CONFIGURED = {
  enabled: true,
  eviction: { enabled: true },
  taskStateEstimator: { baseUrl: "https://api.example.com", apiKey: "sk-x", model: "m" },
};

describe("plugin entry (install smoke)", () => {
  it("exposes the Cordis name + inject metadata", () => {
    assert.equal(name, "tokenpilot-dsh");
    assert.deepEqual(inject, ["tokenMeter"]);
  });

  it("attaches exactly one agent/pre-step handler when enabled", () => {
    const { ctx, events } = mockCtx();
    apply(ctx, CONFIGURED);
    assert.deepEqual(events, ["agent/pre-step"]);
  });

  it("attaches nothing when the master flag is off", () => {
    const { ctx, events } = mockCtx();
    apply(ctx, { enabled: false, eviction: { enabled: true } });
    assert.deepEqual(events, []);
  });

  it("tolerates missing/garbage config (defaults to off, attaches nothing)", () => {
    for (const junk of [undefined, null, "nope", 42, []]) {
      const { ctx, events } = mockCtx();
      apply(ctx, junk);
      assert.deepEqual(events, []);
    }
  });
});
