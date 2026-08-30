---
name: skill-distinctive-frontend-design
description: Use when new or substantially restyled frontend work needs a distinctive aesthetic direction and current output risks generic template-like design.
required_reads: []
distribution_tier: starter_kit
---
# Distinctive Frontend Design

## Role

Give approved frontend requirements one coherent, recognizable art direction. This skill owns aesthetic commitment when selected; `docs/operating_system/rules/frontend-ui-rule.md` owns shared UX, accessibility, responsiveness, states, and rendered-verification routing. Existing project design-system sources own durable primitives.

## When to Use

Use for:

- new screens, landing pages, dashboards, or applications without settled visual direction
- substantial restyling where existing output looks interchangeable with a generic template
- visual concepts requiring deliberate typography, composition, texture, color, or motion

Skip for copy changes, mechanical CSS fixes, isolated frontend logic, or products with a mature design system that already determines the answer.

## Core Method

1. Read product purpose, audience, content hierarchy, existing components, and approved design constraints.
2. Do not invoke another overlapping frontend design skill merely because it is available. If `impeccable` is explicitly selected, defer overlapping visual/UX guidance to it; otherwise resolve this skill's aesthetic direction under `docs/operating_system/rules/frontend-ui-rule.md`. Do not create or persist a second design-system SSOT without approval.
3. State one visual concept in one sentence. Reject directions that only say "modern", "clean", or "premium".
4. Choose one signature device: typography, composition, navigation, illustration, texture, data treatment, or motion.
5. Reuse existing components and tokens. Change primitives only when the concept cannot work without it.
6. Implement consistently. Complexity must match the direction: restrained concepts need precision; expressive concepts may justify richer layout or motion.
7. After the first meaningful pass and substantial visual changes, run `render → inspect → compare → correct` on the target route using available browser-interaction capability when available, according to the repository frontend rule. Fix systemic differences through shared components and semantic tokens.
8. Verify through the repository frontend rule. Do not trade accessibility, content resilience, or interaction clarity for novelty.
9. Treat prototypes and rendered comparisons as evidence for specification approval, not as canonical product behavior.

## Anti-Template Check

Avoid defaulting to these without product-specific reason:

- centered hero, gradient headline, floating blobs, and three-card feature grid
- uniform card grids that ignore information priority and scanning order
- purple-blue gradients, glass cards, excessive rounded containers, or uniform shadows
- interchangeable sans-serif typography with no deliberate hierarchy
- animation on every element instead of one meaningful transition or reveal
- decorative effects that weaken content order or controls
- placeholder copy that hides wrapping, overflow, density, or empty-content problems

Before completion, answer:

- What is the single visual idea?
- Which element makes this product recognizable?
- Can every unusual choice be explained by product context?
- Did existing components remain usable across themes, narrow containers, long content, keyboard input, and reduced motion?

If the first three answers are weak, simplify and choose a stronger direction rather than adding more effects.

## Example

For an operations dashboard, "modern dark dashboard" is not a direction. "Night-shift control room with high-density telemetry, one amber incident rail, and quiet monochrome controls" is specific enough to guide typography, hierarchy, color, and motion while keeping standard controls predictable.

## Common Mistakes

- **Novelty everywhere:** one signature device becomes many competing devices. Keep one dominant idea.
- **Style before content:** decoration determines layout before real content is understood. Start from hierarchy and constraints.
- **New design system:** a page-level concept creates duplicate tokens or components. Extend existing primitives only when reuse fails.
- **Generic variation:** random color, radius, or animation changes masquerade as art direction. Tie choices to the stated concept.

## Provenance

Inspired by Anthropic's Apache-2.0 `frontend-design` skill: `https://github.com/anthropics/skills/tree/main/skills/frontend-design`.
