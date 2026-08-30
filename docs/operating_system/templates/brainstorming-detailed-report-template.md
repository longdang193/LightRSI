---
template_id: brainstorming-detailed-report
target_globs:
- docs/superpowers/plans/brainstorming/*/report.md
required_sections:
- Current situation
- Core problem
- Root causes
- Options analysis
- Recommendation
- Recommended next steps
- Assumptions and unresolved questions
distribution_tier: starter_kit
---

# Brainstorming Detailed Report Template

Use this template to turn brainstorming output into a concise, decision-oriented exploratory report. This report is not approved specification or implementation truth; accepted recommendations must be restated in approved scope or a specification. Follow Occam’s razor: include only information that adds distinct value, avoid duplicate sections, and keep implementation details out of the report because specs and execution plans are handled separately.

## 1. Current situation

Summarize the relevant context, objective, constraints, and background needed to understand the issue. Keep this section factual and concise. Do not include analysis, causes, or recommendations here.

## 2. Core problem

Define the main problem in one clear statement. Add only the most important symptoms or evidence needed to explain why the problem matters. Avoid listing every observed issue.

## 3. Root causes

Identify the underlying causes that explain the core problem. Distinguish causes from symptoms. Avoid repeating the problem statement or re-listing symptoms unless they reveal a deeper cause.

## 4. Options analysis

Analyze only the strongest viable options. Do not list every idea from brainstorming. Use the same structure for each option so the options are easy to compare.

### Option A: [Option name]

**Description:** Briefly explain what this option is.

**Benefits:** Explain the main advantages or upside.

**Trade-offs:** Explain what must be sacrificed, simplified, delayed, or accepted.

**Risks:** Explain what could go wrong or what uncertainty remains.

**Effort / complexity:** Estimate relative difficulty compared with the other options.

**Best fit when:** State the situation where this option is most appropriate.

### Option B: [Option name]

**Description:** Briefly explain what this option is.

**Benefits:** Explain the main advantages or upside.

**Trade-offs:** Explain what must be sacrificed, simplified, delayed, or accepted.

**Risks:** Explain what could go wrong or what uncertainty remains.

**Effort / complexity:** Estimate relative difficulty compared with the other options.

**Best fit when:** State the situation where this option is most appropriate.

### Option C: [Option name]

**Description:** Briefly explain what this option is.

**Benefits:** Explain the main advantages or upside.

**Trade-offs:** Explain what must be sacrificed, simplified, delayed, or accepted.

**Risks:** Explain what could go wrong or what uncertainty remains.

**Effort / complexity:** Estimate relative difficulty compared with the other options.

**Best fit when:** State the situation where this option is most appropriate.

### Comparison summary

Briefly compare the options across impact, simplicity, feasibility, risk, and alignment with the goal. Do not repeat every detail from the option sections. Focus only on the decision-relevant differences that prepare the recommendation.

## 5. Recommendation

Select the best option or combination of options. Explain the rationale using the options analysis above, especially impact, simplicity, feasibility, and risk. Keep this section decision-oriented, not implementation-oriented.

## 6. Recommended next steps

List only the immediate decisions, validations, or planning actions needed to move forward. Do not include a full implementation plan, detailed task breakdown, owners, timeline, interface contracts, invariants, or specification details.

## 7. Assumptions and unresolved questions

List the assumptions behind the analysis and the open questions that still need clarification. Include only items that could materially affect the recommendation or next steps.
