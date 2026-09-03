import assert from "node:assert/strict";
import test from "node:test";

import { createHimalayaMailTool } from "./himalaya-tool.js";

test("himalaya mail tool builds fixed read-only commands", async () => {
  const calls: string[][] = [];
  const tool = createHimalayaMailTool({
    run: async (args) => {
      calls.push(args);
      return { code: 0, stdout: '{"messages":[]}', stderr: "" };
    },
  });

  await tool.execute("call-1", { action: "list", page: 2, pageSize: 10 });
  await tool.execute("call-2", { action: "search", query: "subject Moodle and from SPRZ" });
  await tool.execute("call-3", { action: "read", id: "1180" });

  assert.deepEqual(calls[0], ["--account", "ovgu", "--json", "--log-level", "off", "envelope", "list", "--mailbox", "INBOX", "--page", "2", "--page-size", "10"]);
  assert.deepEqual(calls[1], ["--account", "ovgu", "--json", "--log-level", "off", "envelope", "search", "--mailbox", "INBOX", "--", "subject", "Moodle", "and", "from", "SPRZ"]);
  assert.deepEqual(calls[2], ["--account", "ovgu", "--json", "--log-level", "off", "message", "read", "--mailbox", "INBOX", "1180"]);
});

test("himalaya mail tool rejects non-read-only input", async () => {
  let called = false;
  const tool = createHimalayaMailTool({
    run: async () => {
      called = true;
      return { code: 0, stdout: "{}", stderr: "" };
    },
  });

  const result = await tool.execute("call-1", { action: "send" as never } as never);
  assert.equal(called, false);
  assert.equal(result.details.error, "invalid_arguments");
});
