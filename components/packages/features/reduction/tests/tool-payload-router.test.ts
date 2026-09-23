import test from "node:test";
import assert from "node:assert/strict";

import { classifyToolPayloadContent, classifyToolPayloadContentWithHint } from "../src/reduction/content-classifier.js";
import { reduceToolPayloadText } from "../src/reduction/tool-payload-router.js";

const defaultCfg = {
  stdout: {
    enabled: true,
    maxChars: 200,
    keepHeadLines: 3,
    keepTailLines: 2,
    maxPreviewChars: 80,
    maxItems: 4,
    maxDepth: 2,
  },
  stderr: {
    enabled: true,
    maxChars: 200,
    keepHeadLines: 3,
    keepTailLines: 2,
    maxPreviewChars: 80,
    maxItems: 4,
    maxDepth: 2,
  },
  json: {
    enabled: true,
    maxChars: 200,
    keepHeadLines: 3,
    keepTailLines: 2,
    maxPreviewChars: 80,
    maxItems: 3,
    maxDepth: 2,
  },
  blob: {
    enabled: true,
    maxChars: 80,
    keepHeadLines: 1,
    keepTailLines: 1,
    maxPreviewChars: 32,
    maxItems: 2,
    maxDepth: 1,
  },
};

test("classifyToolPayloadContent detects json arrays", () => {
  const result = classifyToolPayloadContent(JSON.stringify([
    { type: "result", value: "alpha" },
    { type: "warning", value: "beta" },
  ]));
  assert.equal(result.contentType, "json_array");
});

test("classifyToolPayloadContent detects search results", () => {
  const result = classifyToolPayloadContent([
    "src/a.ts:10:const bad = true",
    "src/a.ts:22:throw new Error('x')",
    "src/b.ts:8:TODO fix warning",
  ].join("\n"));
  assert.equal(result.contentType, "search_results");
});

test("classifyToolPayloadContentWithHint uses tool hints to classify code reads", () => {
  const result = classifyToolPayloadContentWithHint(`
function runTask() {
  return true;
}
class Worker {}
`, {
    toolName: "read",
    payloadKind: "stdout",
    fieldName: "output",
  });
  assert.equal(result.contentType, "code_like");
});

test("classifyToolPayloadContentWithHint uses read path extension as code hint", () => {
  const result = classifyToolPayloadContentWithHint("just some content", {
    toolName: "read",
    path: "/repo/src/app/main.ts",
    payloadKind: "stdout",
  });
  assert.equal(result.contentType, "code_like");
});

test("reduceToolPayloadText preserves an explicit bounded code read", () => {
  const payload = Array.from({ length: 60 }, (_, index) => `const value${index} = ${index};`).join("\n");
  const result = reduceToolPayloadText(payload, "stdout", defaultCfg, {
    toolName: "read",
    path: "/repo/src/app.ts",
    payloadKind: "stdout",
    readWindow: { offset: 0, limit: 20 },
  });

  assert.equal(result.changed, false);
  assert.equal(result.text, payload);
});

test("classifyToolPayloadContentWithHint detects readme documents", () => {
  const result = classifyToolPayloadContentWithHint(`
# LightRSI

## Getting Started

- Install dependencies
- Run tests
- Configure providers
`, {
    toolName: "read",
    path: "/repo/README.md",
    payloadKind: "stdout",
  });
  assert.equal(result.contentType, "readme_doc");
});

test("classifyToolPayloadContentWithHint detects task documents", () => {
  const result = classifyToolPayloadContentWithHint(`
# Task Plan

- TODO: finish reduction routes
- Acceptance criteria: preserve code blocks
- Next step: add recover tests
`, {
    toolName: "read",
    path: "/repo/docs/tokenpilot-task-spec.md",
    payloadKind: "stdout",
  });
  assert.equal(result.contentType, "task_doc");
});

test("classifyToolPayloadContent detects markdown documents", () => {
  const result = classifyToolPayloadContent(`
## Notes

- item one
- item two
- item three

| key | value |
| --- | --- |
| a | b |
`);
  assert.equal(result.contentType, "markdown_doc");
});

test("reduceToolPayloadText summarizes large json arrays with omission summary", () => {
  const payload = JSON.stringify([
    { type: "result", id: 1, text: "alpha".repeat(20) },
    { type: "result", id: 2, text: "beta".repeat(20) },
    { type: "warning", id: 3, text: "gamma".repeat(20) },
    { type: "warning", id: 4, text: "delta".repeat(20) },
    { type: "error", id: 5, text: "epsilon".repeat(20) },
  ], null, 2);

  const result = reduceToolPayloadText(payload, "json", defaultCfg);
  assert.equal(result.route, "json_array");
  assert.equal(result.changed, true);
  assert.match(result.text, /"omittedSummary"/);
  assert.match(result.text, /warning|error|result/);
  assert.match(result.text, /"keptIndices"/);
});

test("reduceToolPayloadText keeps anomalous json items via anchor selection", () => {
  const items: Array<Record<string, unknown>> = Array.from({ length: 12 }, (_value, index) => ({
    type: "result",
    status: "ok",
    id: index,
    text: `item-${index}`,
  }));
  items[9] = {
    type: "result",
    status: "error",
    id: 9,
    rare_field: "anomaly",
    text: "important failure marker".repeat(8),
  };

  const payload = JSON.stringify(items, null, 2);
  const result = reduceToolPayloadText(payload, "json", defaultCfg);
  assert.equal(result.route, "json_array");
  assert.equal(result.changed, true);
  assert.match(result.text, /"keptIndices"/);
  assert.match(result.text, /"preview"/);
});

test("reduceToolPayloadText specializes web-style json payloads", () => {
  const payload = JSON.stringify({
    answer: "The repository contains papers on LLM agents and planning.",
    results: [
      {
        title: "zjunlp/LLMAgentPapers",
        url: "https://github.com/zjunlp/LLMAgentPapers",
        content: "Plan-and-solve prompting and multi-agent collaboration are included.".repeat(8),
        score: 0.88,
      },
      {
        title: "GitHub topics",
        url: "https://github.com/topics/paper-list",
        content: "A list of paper collections.".repeat(10),
        score: 0.77,
      },
    ],
    result_count: 2,
    response_time: 3.49,
  }, null, 2);

  const result = reduceToolPayloadText(payload, "json", defaultCfg, {
    toolName: "web_fetch",
    payloadKind: "json",
    fieldName: "output",
  });
  assert.equal(result.route, "json_object");
  assert.equal(result.changed, true);
  assert.match(result.text, /"reduced": "web_result_json"/);
  assert.match(result.text, /"answerPreview"/);
  assert.match(result.text, /"resultIndices"/);
  assert.match(result.text, /"resultsPreview"/);
});

test("reduceToolPayloadText groups search results by file", () => {
  const payload = [
    "src/auth.ts:10:const token = readToken()",
    "src/auth.ts:15:throw new Error('invalid token')",
    "src/ui.ts:3:render(app)",
    "src/ui.ts:18:// TODO warn user",
    "src/db.ts:9:connection failed due to timeout",
    "src/db.ts:14:retry connection",
  ].join("\n");

  const result = reduceToolPayloadText(payload.repeat(4), "stdout", defaultCfg);
  assert.equal(result.route, "search_results");
  assert.equal(result.changed, true);
  assert.match(result.text, /src\/auth\.ts \(\d+ matches\)/);
  assert.match(result.text, /\[search results reduced\]/);
});

test("reduceToolPayloadText losslessly minifies unsafe numbers and duplicate keys", () => {
  const cfg = structuredClone(defaultCfg);
  cfg.json.maxChars = 500;
  const payload = `{
    "value": 9007199254740993,
    "value": "duplicate stays",
    "message": "${"keep ".repeat(24)}"
  }`;

  const result = reduceToolPayloadText(payload, "json", cfg);

  assert.equal(result.text, `{"value":9007199254740993,"value":"duplicate stays","message":"${"keep ".repeat(24)}"}`);
  assert.equal(result.changed, true);
});

test("reduceToolPayloadText falls back to parsed JSON summary after lexical budget", () => {
  const cfg = structuredClone(defaultCfg);
  cfg.json.maxChars = 80;
  const payload = JSON.stringify(Array.from({ length: 20 }, (_value, index) => ({
    id: index,
    message: `value-${index}-${"x".repeat(20)}`,
  })), null, 2);

  const result = reduceToolPayloadText(payload, "json", cfg);

  assert.equal(result.route, "json_array");
  assert.equal(result.changed, true);
  assert.match(result.text, /"reduced": "json_array"/);
});

test("reduceToolPayloadText keeps late fatal log evidence after warning flood", () => {
  const payload = [
    ...Array.from({ length: 40 }, (_value, index) => `WARN progress ${index}`),
    "FATAL deployment failed after timeout",
    "    at deploy (/app/deploy.js:99:4)",
  ].join("\n");

  const result = reduceToolPayloadText(payload, "stderr", defaultCfg);

  assert.match(result.text, /FATAL deployment failed after timeout/);
});

test("reduceToolPayloadText preserves deleted and renamed diff identity", () => {
  const payload = [
    "diff --git a/old.ts b/new.ts",
    "similarity index 95%",
    "rename from old.ts",
    "rename to new.ts",
    "diff --git a/removed.ts b/removed.ts",
    "deleted file mode 100644",
    "--- a/removed.ts",
    "+++ /dev/null",
    "@@ -1,3 +0,0 @@",
    "-removed line",
    "-another removed line",
  ].join("\n").repeat(5);

  const result = reduceToolPayloadText(payload, "stdout", defaultCfg, {
    toolName: "git_diff",
    payloadKind: "stdout",
  });

  assert.match(result.text, /old\.ts -> new\.ts/);
  assert.match(result.text, /removed\.ts \(deleted\)/);
  assert.match(result.text, /lossy=true/);
  assert.match(result.text, /recovery=archive_required/);
});

test("reduceToolPayloadText counts Windows search files and columns", () => {
  const payload = [
    "C:\\repo\\src\\app.ts:10:4: first match",
    "C:\\repo\\src\\app.ts:20: second match",
    "D:\\repo\\src\\other.ts:3:1: warning match",
  ].join("\n").repeat(4);

  const result = reduceToolPayloadText(payload, "stdout", defaultCfg);

  assert.match(result.text, /C:\\repo\\src\\app\.ts/);
  assert.match(result.text, /10:4:/);
  assert.match(result.text, /total_files=2/);
  assert.match(result.text, /displayed_matches=/);
  assert.match(result.text, /omitted_matches=/);
});

test("reduceToolPayloadText keeps important log lines", () => {
  const payload = [
    "npm test",
    "running suite",
    "WARN deprecated package detected",
    "Error: build failed",
    "    at compile (/app/build.js:10:1)",
    "    at main (/app/main.js:2:1)",
    "done",
  ].join("\n").repeat(6);

  const result = reduceToolPayloadText(payload, "stderr", defaultCfg);
  assert.equal(result.route, "log_output");
  assert.equal(result.changed, true);
  assert.match(result.text, /log reduced important_lines=/);
  assert.match(result.text, /Error: build failed/);
});

test("reduceToolPayloadText keeps Node TAP failures and final counts", () => {
  const payload = [
    "TAP version 13",
    "not ok 1 - rejects invalid token",
    "  error: expected 401, received 200",
    "  location: 'test/auth.test.ts:12:3'",
    "ok 2 - accepts valid token",
    "1..2",
    "# tests 2",
    "# pass 1",
    "# fail 1",
    "# duration_ms 18.2",
  ].join("\n").repeat(8);

  const result = reduceToolPayloadText(payload, "stderr", defaultCfg, {
    toolName: "bash",
    payloadKind: "stderr",
    execution: { commandFamily: "node_test", completion: "complete", exitCode: 1 },
  });

  assert.equal(result.route, "log_output");
  assert.equal(result.changed, true);
  assert.match(result.text, /rejects invalid token/);
  assert.match(result.text, /test\/auth\.test\.ts:12:3/);
  assert.match(result.text, /# fail 1/);
  assert.doesNotMatch(result.text, /output incomplete/);
});

test("reduceToolPayloadText keeps late Node TAP assertion evidence", () => {
  const payload = [
    "TAP version 13",
    "not ok 1 - rejects invalid token",
    ...Array.from({ length: 24 }, (_, index) => `    continuation ${index}`),
    "  actual: 200",
    "  expected: 401",
    "  operator: strictEqual",
    "  failureType: 'testCodeFailure'",
    "1..1",
    "# tests 1",
    "# pass 0",
    "# fail 1",
  ].join("\n").repeat(4);

  const result = reduceToolPayloadText(payload, "stderr", defaultCfg, {
    toolName: "node",
    payloadKind: "stderr",
    execution: { commandFamily: "node_test", completion: "complete", exitCode: 1 },
  });

  assert.match(result.text, /actual: 200/);
  assert.match(result.text, /expected: 401/);
  assert.match(result.text, /operator: strictEqual/);
  assert.match(result.text, /failureType: 'testCodeFailure'/);
});

test("reduceToolPayloadText keeps TypeScript diagnostic identity and count", () => {
  const payload = [
    "src/a.ts(4,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    "src/b.ts(8,2): error TS2304: Cannot find name 'missing'.",
    "Found 2 errors.",
  ].join("\n").repeat(8);

  const result = reduceToolPayloadText(payload, "stderr", defaultCfg, {
    toolName: "tsc",
    payloadKind: "stderr",
    execution: { commandFamily: "typescript_diagnostics", completion: "complete", exitCode: 2 },
  });

  assert.equal(result.route, "log_output");
  assert.equal(result.changed, true);
  assert.match(result.text, /src\/a\.ts\(4,7\).*TS2322/);
  assert.match(result.text, /src\/b\.ts\(8,2\).*TS2304/);
  assert.match(result.text, /Found 2 errors/);
});

test("reduceToolPayloadText keeps TypeScript paths and messages case-sensitive", () => {
  const payload = [
    "src/Case.ts(4,7): error TS2322: Type 'String' is not assignable to type 'number'.",
    "src/case.ts(4,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    "  related information keeps diagnostic context",
    "Found 2 errors.",
  ].join("\n").repeat(6);

  const result = reduceToolPayloadText(payload, "stderr", defaultCfg, {
    toolName: "tsc",
    payloadKind: "stderr",
    execution: { commandFamily: "typescript_diagnostics", completion: "complete", exitCode: 2 },
  });

  assert.match(result.text, /src\/Case\.ts\(4,7\).*Type 'String'/);
  assert.match(result.text, /src\/case\.ts\(4,7\).*Type 'string'/);
  assert.match(result.text, /related information keeps diagnostic context/);
});

test("reduceToolPayloadText preserves distinct failure blocks during duplicate floods", () => {
  const payload = [
    ...Array.from({ length: 6 }, () => [
      "not ok 1 - connection test",
      "Error: connection reset",
      "    at connect (/app/client.js:10:1)",
    ].join("\n")),
    "not ok 7 - authentication test",
    "Error: invalid authentication token",
    "    at authenticate (/app/auth.js:22:4)",
    "7 tests failed",
    "Process exited with code 1",
  ].join("\n").repeat(3);

  const result = reduceToolPayloadText(payload, "stderr", {
    ...defaultCfg,
    stderr: { ...defaultCfg.stderr, maxItems: 2 },
  });

  assert.equal(result.route, "log_output");
  assert.equal(result.changed, true);
  assert.match(result.text, /invalid authentication token/);
  assert.match(result.text, /Process exited with code 1/);
  assert.match(result.text, /Occurrences:/);
});

test("reduceToolPayloadText summarizes diff payloads by file", () => {
  const payload = `
diff --git a/src/app.ts b/src/app.ts
index 123..456 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,5 @@
-const a = 1;
+const a = 2;
+const b = 3;
 export function run() {}
diff --git a/src/lib.ts b/src/lib.ts
index 111..222 100644
--- a/src/lib.ts
+++ b/src/lib.ts
@@ -3,3 +3,4 @@
-return oldValue;
+return newValue;
+console.log(newValue);
 `.repeat(4);

  const result = reduceToolPayloadText(payload, "stdout", defaultCfg, {
    toolName: "git_diff",
    payloadKind: "stdout",
  });
  assert.equal(result.route, "diff_output");
  assert.equal(result.changed, true);
  assert.match(result.text, /\[diff reduced files=/);
  assert.match(result.text, /src\/app\.ts/);
  assert.match(result.text, /\+\d+ -\d+/);
});

test("reduceToolPayloadText summarizes code-like payloads by signatures", () => {
  const payload = `
import fs from "node:fs";

export class SearchService {
  constructor(private root: string) {}
}

export async function runSearch(query: string) {
  return query;
}

function helperTransform(input: string) {
  return input.trim();
}

const buildIndex = (
  files: string[],
) => {
  return files.map((file) => file.toLowerCase());
};
`.repeat(8);

  const result = reduceToolPayloadText(payload, "stdout", defaultCfg);
  assert.equal(result.route, "code_like");
  assert.equal(result.changed, true);
  assert.match(result.text, /\[code outlined lines=/);
  assert.match(result.text, /imports:/);
  assert.match(result.text, /\[outlined definitions;/);
  assert.match(result.text, /body elided by LightRSI/);
  assert.match(result.text, /export class SearchService/);
  assert.match(result.text, /export async function runSearch/);
});

test("reduceToolPayloadText summarizes readme documents by headings and bullets", () => {
  const payload = `
# LightRSI

## Overview
LightRSI is a context management system.

## Installation
- Install pnpm
- Run pnpm install
- Run tests

## Usage
- Start the proxy
- Open the visual
- Read the report
`.repeat(8);

  const result = reduceToolPayloadText(payload, "stdout", defaultCfg, {
    toolName: "read",
    path: "/repo/README.md",
    payloadKind: "stdout",
  });

  assert.equal(result.route, "readme_doc");
  assert.equal(result.changed, true);
  assert.match(result.text, /\[markdown reduced headings=/);
  assert.match(result.text, /# LightRSI/);
  assert.match(result.text, /## Installation/);
});

test("reduceToolPayloadText summarizes task documents by highlighted action lines", () => {
  const payload = `
# TokenPilot task plan

- TODO: split content routes
- Acceptance criteria: no recover retrim
- Deliverable: route metrics by type
- Milestone: headroom parity
- Next step: add report tests
`.repeat(10);

  const result = reduceToolPayloadText(payload, "stdout", defaultCfg, {
    toolName: "read",
    path: "/repo/docs/tokenpilot-task-spec.md",
    payloadKind: "stdout",
  });

  assert.equal(result.route, "task_doc");
  assert.equal(result.changed, true);
  assert.match(result.text, /\[task doc reduced highlights=/);
  assert.match(result.text, /Acceptance criteria/);
  assert.match(result.text, /Next step/);
});

test("reduceToolPayloadText outlines exported declarations in file order", () => {
  const payload = `
import fs from "node:fs";

export function loadSessionIndex(sessionId: string) {
  return fs.readFileSync(sessionId, "utf8");
}

export function renderTerminalFrame(text: string) {
  return text.toUpperCase();
}

export class SessionCache {
  hydrate(id: string) {
    return loadSessionIndex(id);
  }
}
`.repeat(8);

  const result = reduceToolPayloadText(payload, "stdout", defaultCfg, {
    toolName: "read",
    path: "/repo/src/session.ts",
    payloadKind: "stdout",
  });

  assert.equal(result.route, "code_like");
  assert.equal(result.changed, true);
  assert.match(result.text, /export function loadSessionIndex/);
  assert.match(result.text, /export function renderTerminalFrame/);
  assert.match(result.text, /export class SessionCache/);
});

test("reduceToolPayloadText keeps controlled small-window code reads intact", () => {
  const payload = [
    "  1 | import fs from \"node:fs\";",
    "  2 | import path from \"node:path\";",
    "  3 | ",
    "  4 | export function loadConfig(file: string) {",
    "  5 |   const full = path.resolve(file);",
    "  6 |   return fs.readFileSync(full, \"utf8\");",
    "  7 | }",
    "  8 | ",
    "  9 | export function saveConfig(file: string, text: string) {",
    " 10 |   fs.writeFileSync(path.resolve(file), text, \"utf8\");",
    " 11 | }",
  ].join("\n").repeat(4);

  const result = reduceToolPayloadText(payload, "stdout", defaultCfg, {
    toolName: "bash",
    path: "/repo/src/config.ts",
    payloadKind: "stdout",
  });
  assert.equal(result.route, "code_like");
  assert.equal(result.changed, false);
});

test("reduceToolPayloadText does not outline explicit code line windows", () => {
  const payload = [
    "120 | export function loadConfig(file: string) {",
    "121 |   const full = path.resolve(file);",
    "122 |   return fs.readFileSync(full, \"utf8\");",
    "123 | }",
  ].join("\n").repeat(4);

  const result = reduceToolPayloadText(payload, "stdout", defaultCfg, {
    toolName: "read",
    path: "/repo/src/config.ts?start_line=120&end_line=123",
    payloadKind: "stdout",
  });

  assert.equal(result.route, "code_like");
  assert.equal(result.changed, false);
});

test("reduceToolPayloadText marks oversized explicit code reads for exact recovery", () => {
  const payload = Array.from(
    { length: 120 },
    (_, index) => `${index + 1} | export const value${index} = "${"x".repeat(82)}";`,
  ).join("\n");

  const result = reduceToolPayloadText(payload, "stdout", defaultCfg, {
    toolName: "read",
    path: "/repo/src/large.ts?start_line=1&end_line=120",
    payloadKind: "stdout",
  });

  assert.equal(result.route, "code_like");
  assert.equal(result.changed, true);
  assert.match(result.reason, /controlled_code_read_oversized/);
  assert.match(result.text, /exact recovery/i);
  assert.doesNotMatch(result.text, /code reduced lines=/);
});

test("reduceToolPayloadText passes through repeated reads of the same code path", () => {
  const payload = `
export function loadConfig(file: string) {
  return file.trim();
}

export function saveConfig(file: string, text: string) {
  return text + file;
}
`.repeat(20);

  const result = reduceToolPayloadText(payload, "stdout", defaultCfg, {
    toolName: "read",
    path: "/repo/src/config.ts",
    payloadKind: "stdout",
  }, {
    previouslyReadPaths: new Set(["/repo/src/config.ts"]),
  });

  assert.equal(result.route, "code_like");
  assert.equal(result.changed, false);
  assert.match(result.reason, /progressive_disclosure_repeat_read/);
});

test("reduceToolPayloadText compresses stale read payloads more aggressively", () => {
  const payload = JSON.stringify(
    Array.from({ length: 10 }, (_value, index) => ({
      type: index === 7 ? "error" : "result",
      id: index,
      text: `entry-${index}-${"x".repeat(80)}`,
    })),
    null,
    2,
  );

  const fresh = reduceToolPayloadText(payload, "json", defaultCfg, {
    toolName: "read",
    payloadKind: "json",
    readState: "fresh",
  });
  const stale = reduceToolPayloadText(payload, "json", defaultCfg, {
    toolName: "read",
    payloadKind: "json",
    readState: "stale",
  });

  assert.equal(fresh.changed, true);
  assert.equal(stale.changed, true);
  assert.ok(stale.text.length < fresh.text.length);
});

test("reduceToolPayloadText compresses superseded read payloads more than fresh reads", () => {
  const payload = [
    "src/auth.ts:10:const token = readToken()",
    "src/auth.ts:15:throw new Error('invalid token')",
    "src/ui.ts:3:render(app)",
    "src/ui.ts:18:// TODO warn user",
    "src/db.ts:9:connection failed due to timeout",
    "src/db.ts:14:retry connection",
  ].join("\n").repeat(5);

  const fresh = reduceToolPayloadText(payload, "stdout", defaultCfg, {
    toolName: "read",
    payloadKind: "stdout",
    path: "/repo/log.txt",
    readState: "fresh",
  });
  const superseded = reduceToolPayloadText(payload, "stdout", defaultCfg, {
    toolName: "read",
    payloadKind: "stdout",
    path: "/repo/log.txt",
    readState: "superseded",
  });

  assert.equal(fresh.changed, true);
  assert.equal(superseded.changed, true);
  assert.ok(superseded.text.length < fresh.text.length);
});

test("reduceToolPayloadText keeps stale code reads less compressed than stale logs", () => {
  const codePayload = [
    "import fs from \"node:fs\";",
    "export function load(path: string) {",
    "  const text = fs.readFileSync(path, \"utf8\");",
    "  if (!text) return \"\";",
    "  return text.trim();",
    "}",
  ].join("\n").repeat(40);
  const logPayload = [
    "WARN deprecated package detected",
    "Error: build failed",
    "    at compile (/app/build.js:10:1)",
    "    at main (/app/main.js:2:1)",
    "done",
  ].join("\n").repeat(18);

  const staleCode = reduceToolPayloadText(codePayload, "stdout", defaultCfg, {
    toolName: "bash",
    path: "/repo/src/config.ts",
    payloadKind: "stdout",
    readState: "stale",
  });
  const staleLog = reduceToolPayloadText(logPayload, "stderr", defaultCfg, {
    toolName: "read",
    path: "/repo/build.log",
    payloadKind: "stderr",
    readState: "stale",
  });

  assert.equal(staleCode.route, "code_like");
  assert.equal(staleLog.route, "log_output");
  assert.equal(staleCode.changed, true);
  assert.equal(staleLog.changed, true);
  assert.ok(staleCode.text.length > staleLog.text.length);
});
