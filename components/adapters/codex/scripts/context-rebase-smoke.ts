import { runCodexRebaseMockSmoke } from "../src/context-rebase-smoke.js";

function optionValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length);
}

function printHelp(): void {
  console.log([
    "Usage: npm run smoke:context-rebase:codex -- [options]",
    "",
    "Options:",
    "  --mode=mock          Run the offline scripted Responses smoke (default).",
    "  --model=<name>       Non-sensitive model label recorded in evidence.",
    "  --output-dir=<path>  Directory for the sanitized evidence JSON.",
    "  --help               Show this help.",
    "",
    "This offline command never reads an API key and never persists raw prompts,",
    "headers, response ids, or encrypted reasoning payloads in its evidence file.",
  ].join("\n"));
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }
  const mode = optionValue("mode") ?? "mock";
  if (mode !== "mock") {
    throw new Error("Only --mode=mock is available in the offline smoke command");
  }
  const result = await runCodexRebaseMockSmoke({
    model: optionValue("model"),
    outputDir: optionValue("output-dir"),
  });
  console.log(JSON.stringify({
    ok: true,
    mode: result.evidence.mode,
    artifactPath: result.artifactPath,
    artifactSha256: result.artifactSha256,
    sentinel: result.evidence.happyPath.sentinel,
    continuationTurns: result.evidence.happyPath.responseChain.continuationTurns,
    fallbackSucceeded: result.evidence.fallback.fallbackSucceeded,
    moduleMatrixPassed: result.evidence.moduleMatrix.every((entry) => entry.isolationPassed),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
