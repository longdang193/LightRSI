---
name: skill-requesting-code-review
description: Use when completed code changes need independent review before further implementation, handoff, merge, or release.
required_reads: []
distribution_tier: starter_kit
---

# Requesting Code Review

Request independent review to catch issues before they cascade. Select review topology from the owning coordination method. The reviewer gets precisely crafted context for evaluation, never the producer session's history. This keeps review focused on the work product and preserves the producer context for continued work.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After completing major feature
- Before merge to main
- When independent review is required by the active lifecycle or plan

Task-scoped review in `skill-subagent-driven-development` owns per-task review;
do not dispatch a second whole-branch review for the same task.

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse "$APPROVED_BASE")
HEAD_SHA=$(git rev-parse HEAD)
```

`APPROVED_BASE` must come from the active plan, caller, or recorded merge base.
Do not infer a base from commit count; `HEAD~1` can omit multi-commit changes.

**2. Select review topology:**

Ordinary execution may dispatch a native reviewer subagent. CoS main-agent
coordination may dispatch an independent Herdr top-level Codex main agent.
Neither choice changes the review contract or makes the reviewer a merge
owner.

**3. Dispatch independent reviewer:**

Dispatch a controller-selected discovered-profile reviewer,
filling the template at `code-reviewer.md`
Review context must include each applicable frontend, backend, and E2E evidence
class plus approved deviations.

**Placeholders:**
- `[DESCRIPTION]` - Brief summary of what you built
- `[PLAN_OR_REQUIREMENTS]` - What it should do
- `[SPECIFICATION_OR_APPROVED_SCOPE]` - Approved behavior and preserved invariants
- `[PROTOTYPE_REFERENCE]` - Prototype and validation findings when material, otherwise `Not applicable: <reason>`
- `[EVIDENCE_CONTEXT]` - Each applicable frontend, backend, and E2E evidence class with result or approved gap
- `[APPROVED_DEVIATIONS]` - Explicit deviations from plan or specification, or `none`
- `[BASE_SHA]` - Starting commit
- `[HEAD_SHA]` - Ending commit

**4. Act on feedback:**
- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch reviewer through selected topology]
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  PLAN_OR_REQUIREMENTS: Task 2 from docs/superpowers/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## Integration

**Delegated or parallel execution:**
- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Executing Plans:**
- Review after each task or at natural checkpoints
- Get feedback, apply, continue

**Ad-Hoc Development:**
- Review before merge
- Review when stuck

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: `code-reviewer.md`
