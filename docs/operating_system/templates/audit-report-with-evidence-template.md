---
template_id: audit-report-with-evidence
target_globs:
- docs/superpowers/plans/audit/????-??-??-??-??-*/report.md
required_sections:
- Current situation
- Core problem
- Evidence and reproduction
- Root cause and boundary
- Resolution and verification
- Risk and next steps
- Assumptions and unresolved questions
distribution_tier: starter_kit
---
# Audit Report With Evidence Template

Use only for qualifying or explicitly requested failures requiring formal evidence. Do not use for ordinary debugging or design exploration. Save as `docs/superpowers/plans/audit/<audit_id>/report.md`. Add `evidence/` or `repro/` files only when they contain real artifacts needed by report.

## 1. Current situation

State affected environment and surface, relevant branch or commit, incident status, and important constraints.

## 2. Core problem

State expected behavior, actual behavior, impact, severity, and affected users, data, or systems. Group related symptoms under one incident-level problem.

## 3. Evidence and reproduction

Provide exact reproduction steps, commands, inputs, seeds, or configuration. Link logs, screenshots, traces, result files, or reproduction assets only when they exist.

Keep reproduction commands in report unless separate files are materially easier to run or preserve. Redact secrets before saving evidence.

## 4. Root cause and boundary

State confirmed failure boundary, evidence-supported root cause, and affected invariant or contract. If root cause remains unknown, say so; do not present hypothesis as fact.

## 5. Resolution and verification

If resolved, state smallest applied fix, verification commands, resulting evidence, and preserved behavior.

If unresolved, state current mitigation, evidence still needed, and blocking condition. Do not include full implementation plan.

## 6. Risk and next steps

State residual risk, current disposition, immediate remediation or planning action, and whether separate brainstorming, specification, or plan is needed.

## 7. Assumptions and unresolved questions

List only assumptions or questions that could change root-cause confidence, risk, disposition, or next action.
