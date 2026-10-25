import assert from "node:assert/strict";
import test from "node:test";

import type { HostRequestEnvelope } from "@lightrsi/host-adapter";
import { prepareBeforeCall } from "@lightrsi/host-adapter";
import {
  applyGenerationPolicy,
  compileGenerationPolicy,
  isProtectedGenerationPolicyRequest,
  normalizeGenerationPolicyConfig,
  resolveCavemanPolicy,
  resolvePonytailPolicy,
  validateGenerationPolicyConfig,
} from "../src/index.js";

function envelope(rawPayload: Record<string, unknown> = {}): HostRequestEnvelope {
  return {
    session: {
      host: { hostId: "test", displayName: "test" },
      sessionId: "session",
      sessionMode: "single",
    },
    model: "test-model",
    stream: false,
    instructions: "Base instructions.",
    messages: [{ role: "user", content: "Do work." } as never],
    tools: [{ type: "function", name: "search", parameters: { type: "object" } }],
    rawPayload,
  };
}

test("normalizes missing policy to disabled full levels", () => {
  assert.deepEqual(normalizeGenerationPolicyConfig(undefined), {
    caveman: { enabled: false, level: "full" },
    ponytail: { enabled: false, level: "full" },
  });
});

test("strict validation distinguishes omitted levels from invalid explicit levels", () => {
  assert.doesNotThrow(() => validateGenerationPolicyConfig(undefined));
  assert.doesNotThrow(() => validateGenerationPolicyConfig({
    caveman: { enabled: true },
    ponytail: { enabled: false, level: "full" },
  }));
  assert.throws(
    () => validateGenerationPolicyConfig({
      caveman: { level: "bad-caveman-level" },
      ponytail: { level: "bad-ponytail-level" },
    }),
    /caveman\.level, ponytail\.level.*lite, full, ultra/u,
  );
  assert.deepEqual(normalizeGenerationPolicyConfig({ caveman: { level: "bad" } }).caveman, {
    enabled: false,
    level: "full",
  });
});

test("full policies preserve concrete executable verification commands", () => {
  assert.match(resolveCavemanPolicy("full"), /executable commands/u);
  assert.match(resolvePonytailPolicy("full"), /concrete/u);
  assert.match(resolvePonytailPolicy("full"), /placeholders/u);
});

test("applies enabled policies once and preserves tools and history", () => {
  const input = envelope({ input: [{ role: "tool", content: "historical result" }] });
  const originalTools = structuredClone(input.tools);
  const originalMessages = structuredClone(input.messages);
  const config = normalizeGenerationPolicyConfig({
    caveman: { enabled: true, level: "lite" },
    ponytail: { enabled: true, level: "ultra" },
  });

  const first = applyGenerationPolicy(input, config);
  const second = applyGenerationPolicy(first, config);

  assert.notEqual(first, input);
  assert.equal(second, first);
  assert.equal((first.instructions?.match(/\[LightRSI/g) ?? []).length, 2);
  assert.deepEqual(input.tools, originalTools);
  assert.deepEqual(input.messages, originalMessages);
  assert.equal(typeof first.metadata?.generationPolicyDigest, "string");
  assert.equal(first.metadata?.generationPolicyVersion, "v2/v2");
});

test("compiled policy identity is request-independent and disabled policies have no digest", () => {
  const compiled = compileGenerationPolicy({
    caveman: { enabled: true, level: "full" },
    ponytail: { enabled: false, level: "full" },
  });
  const first = applyGenerationPolicy(envelope({ request: "one" }), compiled);
  const second = applyGenerationPolicy(envelope({ request: "two" }), compiled);

  assert.equal(first.metadata?.generationPolicyDigest, second.metadata?.generationPolicyDigest);
  assert.equal(compileGenerationPolicy(undefined).digest, null);
});

test("reapplies metadata after decode without duplicating the owned block", () => {
  const compiled = compileGenerationPolicy({
    caveman: { enabled: true, level: "full" },
    ponytail: { enabled: true, level: "full" },
  });
  const first = applyGenerationPolicy(envelope(), compiled);
  const decoded = { ...first, metadata: undefined };
  const reapplied = applyGenerationPolicy(decoded, compiled);

  assert.equal((reapplied.instructions?.match(/\[LightRSI/g) ?? []).length, 2);
  assert.equal(reapplied.metadata?.generationPolicyApplied, true);
  assert.equal(reapplied.metadata?.generationPolicyDigest, compiled.digest);
});

test("protects exact structured-output requests but not ordinary tools", () => {
  assert.equal(isProtectedGenerationPolicyRequest({ text: { format: { type: "json_schema" } } }), true);
  assert.equal(isProtectedGenerationPolicyRequest({ text: { format: { type: "json_object" } } }), true);
  assert.equal(isProtectedGenerationPolicyRequest({ text: { format: { strict: true } } }), true);
  assert.equal(isProtectedGenerationPolicyRequest({ response_format: { type: "json_schema" } }), true);
  assert.equal(isProtectedGenerationPolicyRequest({ tools: [{ type: "function", name: "search" }] }), false);
});

test("pipeline applies policy before stable prefix", async () => {
  const order: string[] = [];
  const result = await prepareBeforeCall({
    envelope: envelope(),
    helpers: {
      applyGenerationPolicy(next) {
        order.push("policy");
        return { ...next, instructions: `${next.instructions}\npolicy` };
      },
      prepareStablePrefix(next) {
        order.push("stable");
        assert.match(next.instructions ?? "", /policy/);
        return next;
      },
    },
  });

  assert.deepEqual(order, ["policy", "stable"]);
  assert.equal(result.diagnostics.generationPolicyApplied, true);
  assert.equal(result.diagnostics.stablePrefixApplied, false);
});

test("pipeline attributes stable-prefix changes independently from policy changes", async () => {
  const result = await prepareBeforeCall({
    envelope: envelope(),
    helpers: {
      applyGenerationPolicy(next) {
        return { ...next, instructions: `${next.instructions}\npolicy` };
      },
      prepareStablePrefix(next) {
        return { ...next, instructions: `${next.instructions}\nstable` };
      },
    },
  });

  assert.equal(result.diagnostics.generationPolicyApplied, true);
  assert.equal(result.diagnostics.stablePrefixApplied, true);
});
