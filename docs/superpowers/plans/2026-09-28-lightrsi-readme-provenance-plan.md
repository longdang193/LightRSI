---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: completed
layer: change
created_at: 2026-09-28
repository: LightMem2
base_commit: d30066904fedb0a29e028662a8669261c3cdfce0
targets:
  - README.md
---

# LightRSI README Provenance And Positioning

## Goal

Make the root README fork-first: users should understand this repository's
product value and fork-specific behavior before encountering inherited LightRSI
and TokenPilot material. Upstream research, announcements, and attribution must
remain available without looking like claims made by this fork.

## Implementation Outcomes

### Clear fork identity and value proposition

The first screen identifies this repository as an independently maintained fork,
states its three product promises, and shows the fork-specific Compact result
with explicit workload scope.

### Explicit ownership boundaries

README groups capabilities into inherited upstream foundation, fork-specific
changes, and upstream reference material. Existing local README improvements
remain intact and are reorganized rather than reverted.

### Upstream content no longer looks like fork evidence

Copied PinchBench and Claw-Eval tables leave the root README. The root keeps
short link-only upstream research guidance while fork-specific validation stays
prominent.

### Navigation and support provenance match the fork

Section names, table of contents, architecture wording, citation labels,
contributor labels, community links, and internal anchors consistently identify
upstream versus fork-owned material.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `none`
- Required skills: `skill-verification-before-completion`
- Isolation: `current workspace`
- Commit policy: `no commits during execution`
- Preauthorized local actions: edit `README.md`, create this plan, and run declared local documentation checks
- User-approval actions: publication, push, merge, external writes, destructive recovery, discard, and cleanup
- Parallel ownership: none
- Sequential fallback: Task 1, then Task 2, then Task 3

## Task Breakdown

### Task 1: Rewrite first-screen fork positioning

**Purpose:** Make fork identity and unique value proposition unmissable before technical detail.

**Task Function:** Restructure the opening without changing runtime claims.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: bounded documentation edit with known source sections and low risk.

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: final README inspection and repository-local checks are sufficient.

**Specification Coverage:** Top fork banner, three product promises, fork-specific metrics, and ownership table.

**Required Skills:** `none`

**Files And Symbols:**
- Inspect: `README.md` opening badge block, `<span id='fork'/>`, `## 🌿 What This Fork Is`, `### Why use this fork?`
- Modify: `README.md` opening section and feature ownership table
- Verify: `README.md` first 70 lines

**Dependencies:** Current workspace contains uncommitted `README.md` clarification changes from the prior pass. Inspect `git diff -- README.md` before editing and preserve those changes; if the workspace is reset, start from the current `README.md` headings and apply the same outcomes.

**Authority:**
- Preauthorized local actions: edit the opening sections of `README.md` and run local checks
- Stop for: changes to product claims, benchmark numbers, repository identity, or files outside this plan

**Steps:**
- [x] Add a visible independent-fork banner immediately below the tagline and identify `zjunlp/LightRSI` as upstream.
- [x] Add a fork-maintenance badge or equivalent plain-text identity signal; keep `LightRSI` as framework name.
- [x] Reduce the opening proposition to Compact before accumulation, deliberate historical release, and recoverable long sessions.
- [x] Keep `60.91%` input-token reduction and `35.11%` estimated-cost reduction labeled as the fork's controlled Compact workload.
- [x] Keep one ownership table covering inherited TokenPilot foundation, fork-specific capabilities, and upstream reference material.

**Verification:**
- [x] `Get-Content README.md | Select-Object -First 70`
- Expected: a reader can identify fork ownership, product value, and metric provenance without reading later sections.

**Exit Criteria:** Opening README content is fork-first, concise, and contains no unqualified upstream performance claim.

### Task 2: Remove upstream ambiguity from body sections

**Purpose:** Stop inherited research and project history from appearing as current fork behavior or evidence.

**Task Function:** Replace copied upstream material with scoped links and rename ambiguous sections.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: documentation-only restructuring with explicit source sections.

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: provenance wording and diff checks provide focused proof.

**Specification Coverage:** Upstream-reference-only research, fork-specific validation, upstream news separation, and centralized attribution.

**Required Skills:** `none`

**Files And Symbols:**
- Inspect: `README.md` `## 🧪 How We Validate It`, `## 🧩 Core Runtime Paths`, `## 📚 Upstream Reference Results`, `## 📄 Upstream Heritage & Attribution`, `## 💬 Community`
- Modify: `README.md` sections listed above
- Verify: `README.md` fork validation and upstream heritage sections

**Dependencies:** Task 1 ownership vocabulary is final.

**Authority:**
- Preauthorized local actions: edit named README sections, delete copied upstream tables, and update internal links
- Stop for: adding new benchmark claims, changing source data, moving tables into a new document, or modifying upstream repositories

**Steps:**
- [x] Keep Compact and historical-release measurements in `How We Validate It`, including the negative Cleaner cost result and its limitations.
- [x] Replace full PinchBench and Claw-Eval tables with a short `Upstream Reference Results` section linking to upstream LightRSI, TokenPilot, and reproduction material.
- [x] Rename or remove `News`; use `Upstream Project News` if retained, and do not create fork announcements without fork-owned events.
- [x] Rename `Components` to `Core Runtime Paths` and remove speculative framework-roadmap wording.
- [x] Rename `Architecture` to `Fork Architecture` and state that it describes this fork's current `main` branch, not upstream.
- [x] Consolidate repeated provenance statements under `Upstream Heritage & Attribution`; rename citation and contributor labels accordingly.
- [x] Label community destinations as upstream or fork-owned; do not imply upstream support for this fork.

**Verification:**
- [x] `if (rg -n "^\\| (Method|Vanilla|LightRSI) \\|" README.md) { throw "Copied benchmark table remains in README.md" }`
- Expected: command succeeds with no output.
- [x] `rg -n "^## .*Core Runtime Paths|^## .*Fork Architecture|^## .*Upstream Reference Results|^## .*Upstream Heritage & Attribution|^## .*Upstream Contributors" README.md`
- Expected: each renamed ownership section exists exactly once.
- [x] `if (rg -n "About This Fork|What Changed in This Fork|Experimental Results|Original Contributors" README.md) { throw "Stale section name remains in README.md" }`
- Expected: command succeeds with no output.

**Exit Criteria:** Root README contains fork-specific evidence and instructions, while inherited material is link-only or explicitly grouped under upstream heritage.

### Task 3: Reconcile navigation and final documentation proof

**Purpose:** Ensure renamed sections remain reachable and provenance wording stays consistent after restructuring.

**Task Function:** Update anchors, table of contents, and final README checks.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: mechanical documentation reconciliation.

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: local diff and anchor inspection cover the changed surface.

**Specification Coverage:** Table-of-contents order, internal links, stale wording removal, and clean documentation diff.

**Required Skills:** `skill-verification-before-completion`

**Files And Symbols:**
- Inspect: `README.md` table of contents and all renamed section anchors
- Modify: `README.md` table of contents and internal references
- Verify: `README.md`, `git diff --check`

**Dependencies:** Tasks 1 and 2 complete.

**Authority:**
- Preauthorized local actions: update README anchors and run local documentation checks
- Stop for: adding dependencies, changing code, or accepting broken links as known limitations

**Steps:**
- [x] Order the table of contents as fork identity, current fork workflow, Compact context, Context Cleaner, fork-specific changes, validation, installation, quick start, visual results, fork architecture, experiment reproduction, commands, upstream reference results, attribution, contributing, upstream contributors, related works, and community.
- [x] Update links for renamed headings and replace stale references such as `Experimental Results`.
- [x] Search for stale headings and labels that imply upstream results belong to this fork.
- [x] Review the complete README diff for duplicated disclaimers, unsupported claims, and accidental deletion of fork-specific evidence.

**Verification:**
- [x] `git diff --check`
- Expected: no whitespace errors.
- [x] `if (rg -n "About This Fork|What Changed in This Fork|Experimental Results|Original Contributors|^## 📢 News$|^## 🧩 Components$|^## 🏗️ Architecture$" README.md) { throw "Stale ambiguous heading remains in README.md" }`
- Expected: command succeeds with no output.
- [x] `rg -n "^## .*What This Fork Is|^## .*Fork-Specific Changes|^## .*How We Validate It|^## .*Fork Architecture|^## .*Upstream Heritage & Attribution" README.md`
- Expected: current fork-owned and attribution headings remain present.
- [x] `rg -n "60\.91%|35\.11%|Fork-specific|Upstream|Not Fork Measurements" README.md`
- Expected: fork metrics and provenance labels remain present.

**Exit Criteria:** README navigation resolves to current headings, provenance checks pass, and only `README.md` plus this plan change.

## Verification

- `git diff --check`
- `if (rg -n "^\\| (Method|Vanilla|LightRSI) \\|" README.md) { throw "Copied benchmark table remains in README.md" }`
- `if (rg -n "About This Fork|What Changed in This Fork|Experimental Results|Original Contributors|^## 📢 News$|^## 🧩 Components$|^## 🏗️ Architecture$" README.md) { throw "Stale ambiguous heading remains in README.md" }`
- `rg -n "^## .*What This Fork Is|^## .*Fork-Specific Changes|^## .*How We Validate It|^## .*Fork Architecture|^## .*Upstream Heritage & Attribution|60\.91%|35\.11%|Fork-specific|Upstream|Not Fork Measurements" README.md`
- Manual review of the rendered README opening, fork validation section, upstream heritage section, and table of contents.

## Completion Criteria

The plan is ready for completion verification when:

1. The first README screen identifies the repository as an independent fork and explains its three product promises.
2. Fork-specific Compact and Cleaner evidence remains prominent and scoped.
3. Full upstream benchmark tables and unqualified upstream announcements no longer appear as fork content.
4. Architecture, components, attribution, contributors, community, and navigation identify ownership consistently.
5. All declared local checks pass with no unrelated file changes.
