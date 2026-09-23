import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("bench-hotspots honors configured sample count", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/bench-hotspots.mjs", import.meta.url));
  const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, LIGHTRSI_BENCHMARK_SAMPLE_RUNS: "1" },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout) as { sampleRuns?: number };
  assert.equal(report.sampleRuns, 1);
});
