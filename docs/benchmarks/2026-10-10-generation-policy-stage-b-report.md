# LightRSI generation policy Stage B

- Mode: live
- Source SHA: a8dd9d3bcb4e843d32db3febdb8877959f553208
- Source tree: clean
- Workload: security, multiturn; repetitions=5.
- Caveman and Ponytail were swept independently; no combined cross-product was run.
- All six exploratory arms passed the two-fixture correctness oracle: Caveman Lite/Full/Ultra and Ponytail Lite/Full/Ultra.
- Each arm made 15 provider calls across five repetitions: one security call plus a two-call multi-turn exchange per repetition.
- Mean / median latency in milliseconds: Caveman Lite 5077.2 / 4026; Caveman Full 4068.4 / 4306; Caveman Ultra 4052.5 / 3847; Ponytail Lite 4972.5 / 4740; Ponytail Full 5027.5 / 4271; Ponytail Ultra 4202.7 / 3106.5.
- The exploratory results include provider usage and per-row latency; completed-task economics and stability remain inconclusive because no baseline arm was run in Stage B.
- Router preflight matched the existing dashboard evidence: Caveman disabled and Ponytail disabled; no 9Router settings were changed.
- Post-run TokenPilot cache audit: 43 router telemetry events, 43 configured-gateway identity events, 0 safe-header events, and 0 exact route/provider/cache identity events. Exact router-side identity was unavailable.
- Provider traffic completed through TokenPilot at `http://127.0.0.1:17667/v1` with router `http://127.0.0.1:20128` and model `cx/gpt-5.6-luna`.
- The exploratory exception does not authorize promotion, default changes, or adapter expansion.
- Decision: no promotion.
