# Security

## Local-Only Architecture

LightRSI runs entirely on your machine. All processing is local. The only network traffic is what your agent host already sends to the model API. LightRSI does not add new external calls.

- No API keys are read, stored, or forwarded.
- No telemetry or analytics is collected.

## Backups Before Changes

Before modifying existing configuration files, LightRSI creates `.tokenpilot.bak` backups.

## Vulnerability Reporting

Report concerns via [GitHub Issues](https://github.com/zjunlp/LightRSI/issues). A formal security policy has not yet been published.
