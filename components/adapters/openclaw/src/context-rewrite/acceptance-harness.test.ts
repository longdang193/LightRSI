import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  MockUpstreamRecorder,
  createAcceptanceSentinels,
  createTemporaryAcceptanceEnvironment,
  formatAcceptanceSummary,
  inspectToolClosure,
  runAcceptanceHarness,
} from "./acceptance-harness.js";

const TEST_UUID = "11111111-2222-4333-8444-555555555555";

test("creates deterministic acceptance sentinels", () => {
  const sentinels = createAcceptanceSentinels(TEST_UUID);

  assert.equal(sentinels.uuid, TEST_UUID);
  assert.equal(sentinels.evict, `EVICT_ME_${TEST_UUID}`);
  assert.equal(sentinels.keep, `KEEP_ME_${TEST_UUID}`);

  assert.throws(
    () => createAcceptanceSentinels("invalid"),
    /Invalid acceptance sentinel UUID/,
  );
});

test("checks function and custom tool closure independently", () => {
  const complete = inspectToolClosure({
    input: [
      {
        type: "function_call",
        call_id: "function-1",
        name: "read_file",
      },
      {
        type: "function_call_output",
        call_id: "function-1",
        output: "done",
      },
      {
        type: "custom_tool_call",
        call_id: "custom-1",
        name: "custom",
      },
      {
        type: "custom_tool_call_output",
        call_id: "custom-1",
        output: "done",
      },
    ],
  });

  assert.equal(complete.complete, true);
  assert.deepEqual(complete.missingOutputs, []);
  assert.deepEqual(complete.orphanOutputs, []);

  const incomplete = inspectToolClosure({
    input: [
      {
        type: "function_call",
        call_id: "missing-output",
      },
      {
        type: "custom_tool_call_output",
        call_id: "orphan-output",
      },
    ],
  });

  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.missingOutputs, [
    "function_call:missing-output",
  ]);
  assert.deepEqual(incomplete.orphanOutputs, [
    "custom_tool_call:orphan-output",
  ]);
});

test("validates requests before and after restart", () => {
  const sentinels = createAcceptanceSentinels(TEST_UUID);
  const recorder = new MockUpstreamRecorder();

  const validBody = {
    input: [
      {
        type: "message",
        role: "user",
        content: sentinels.keep,
      },
      {
        type: "function_call",
        call_id: "call-1",
        name: "read_file",
      },
      {
        type: "function_call_output",
        call_id: "call-1",
        output: "done",
      },
    ],
  };

  recorder.record("before_restart", validBody);
  recorder.record("after_restart", validBody);
  recorder.record(
    "after_restart",
    {
      input: [sentinels.evict],
    },
    { fallback: true },
  );

  const summary = runAcceptanceHarness({
    sentinels,
    requests: recorder.requests(),
    originalCharacters: 1000,
    rewrittenCharacters: 600,
  });

  assert.equal(summary.passed, true);
  assert.equal(summary.requestCount, 3);
  assert.equal(summary.savedCharacters, 400);
  assert.equal(summary.fallbackCount, 1);
  assert.equal(summary.phases[0].passed, true);
  assert.equal(summary.phases[1].passed, true);

  assert.equal(
    formatAcceptanceSummary(summary),
    "status=PASS request_count=3 saved_characters=400 fallback_count=1",
  );
});

test("fails when an effective request keeps evicted context", () => {
  const sentinels = createAcceptanceSentinels(TEST_UUID);
  const recorder = new MockUpstreamRecorder();

  recorder.record("before_restart", {
    input: [sentinels.keep, sentinels.evict],
  });

  recorder.record("after_restart", {
    input: [sentinels.keep],
  });

  const summary = runAcceptanceHarness({
    sentinels,
    requests: recorder.requests(),
    originalCharacters: 100,
    rewrittenCharacters: 120,
  });

  assert.equal(summary.passed, false);
  assert.equal(summary.savedCharacters, 0);
  assert.equal(summary.phases[0].evictFound, true);
  assert.equal(summary.phases[0].passed, false);
});

test("uses isolated temporary home and state directories", () => {
  const environment = createTemporaryAcceptanceEnvironment(
    "lightmem2-acceptance-test-",
  );

  try {
    assert.equal(fs.existsSync(environment.rootDir), true);
    assert.equal(fs.existsSync(environment.homeDir), true);
    assert.equal(fs.existsSync(environment.stateDir), true);

    assert.equal(environment.env.HOME, environment.homeDir);
    assert.equal(environment.env.USERPROFILE, environment.homeDir);
    assert.equal(
      environment.env.OPENCLAW_STATE_DIR,
      environment.stateDir,
    );

    assert.equal(
      path.dirname(environment.homeDir),
      environment.rootDir,
    );
    assert.equal(
      path.dirname(environment.stateDir),
      environment.rootDir,
    );
  } finally {
    environment.cleanup();
  }

  assert.equal(fs.existsSync(environment.rootDir), false);
});
