import { join } from "node:path";
import { readRecentJsonlEntries } from "@lightrsi/host-adapter";
import {
  defaultTokenPilotConfigPath,
  loadTokenPilotCodexConfig,
} from "../src/config.js";
import type { RouterCacheTelemetry } from "../src/router-cache-telemetry.js";
import {
  readRecentCodexCacheAuditRecords,
  summarizeCodexCacheAudit,
} from "../src/cache-audit.js";

type TraceRecord = {
  routerCacheTelemetry?: RouterCacheTelemetry;
};

async function main() {
  const tokenPilotConfigPath = process.env.TOKENPILOT_CODEX_CONFIG ?? defaultTokenPilotConfigPath();
  const config = await loadTokenPilotCodexConfig(tokenPilotConfigPath);
  const records = await readRecentCodexCacheAuditRecords(config.stateDir, 64);
  if (records.length === 0) {
    console.log("TokenPilot Codex cache audit: no records yet.");
    return;
  }
  const summary = summarizeCodexCacheAudit(records);
  const traceRecords = await readRecentJsonlEntries<TraceRecord>(
    join(config.stateDir, "event-trace.jsonl"),
    128,
    (value): value is TraceRecord => Boolean(
      value
      && typeof value === "object"
      && "routerCacheTelemetry" in value,
    ),
  );
  const routerTelemetry = traceRecords
    .map((record) => record.routerCacheTelemetry)
    .filter((value): value is RouterCacheTelemetry => Boolean(value));
  const latestRouterTelemetry = routerTelemetry[0];
  const routerHeaderEvents = routerTelemetry.filter((value) => Object.keys(value.boundary).length > 0).length;
  const routerIdentityEvents = routerTelemetry.filter((value) => (
    value.routeId !== null
    || value.provider !== null
    || value.routerCacheFamilyId !== null
    || value.routerPromptCacheKey !== null
  )).length;
  const configuredGatewayEvents = routerTelemetry.filter((value) => value.configuredEndpointDigest !== null).length;
  console.log("TokenPilot Codex cache audit report:");
  console.log(`- records: ${summary.totalRecords}`);
  console.log(`- latest session: ${summary.latestSessionId ?? "(unknown)"}`);
  console.log(`- latest fingerprint: ${summary.latestFingerprint ?? "(unknown)"}`);
  console.log(`- warm candidates: ${summary.warmCandidates}`);
  console.log(`- warm cache hits: ${summary.warmHits}`);
  console.log(`- warm cache misses: ${summary.warmMisses}`);
  console.log(`- warm hit rate: ${summary.hitRatePercent}%`);
  console.log(`- provider cached input tokens: ${summary.cachedInputTokens}`);
  console.log(`- router telemetry events: ${routerTelemetry.length}`);
  console.log(`- router safe-header events: ${routerHeaderEvents}`);
  console.log(`- router configured gateway identity events: ${configuredGatewayEvents}`);
  console.log(`- router exact route/provider/cache identity events: ${routerIdentityEvents}`);
  console.log(`- latest router telemetry status: ${latestRouterTelemetry?.status ?? "(none)"}`);
  console.log(`- safe gateway identity proof: ${configuredGatewayEvents > 0 ? "available" : "unavailable"}`);
  console.log(`- exact router-side identity proof: ${routerIdentityEvents > 0 ? "available" : "unavailable"}`);
  console.log(`- response cache key rewrites: ${summary.responsePromptCacheKeyRewriteCount}`);
  console.log(
    `- top entropy kinds: ${summary.topEntropyKinds.length > 0
      ? summary.topEntropyKinds.map((item) => `${item.key}=${item.count}`).join(", ")
      : "(none)"}`,
  );
  console.log(
    `- top drift keys: ${summary.topDriftKeys.length > 0
      ? summary.topDriftKeys.map((item) => `${item.key}=${item.count}`).join(", ")
      : "(none)"}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
