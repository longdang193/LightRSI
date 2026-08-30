---
name: skill-creating-learning-materials
description: Use when creating source-grounded questions, cards, exercises, or study materials.
required_reads: []
distribution_tier: starter_kit
---
# Creating Learning Materials

## Core Principle

Create learning materials from source evidence, not generic trivia. Questions
should help the learner remember, explain, apply, reason about, and interview
with the material.

This skill generates human learning materials. It is not for explaining or
maintaining agent-control skills unless those are explicitly the study source.

## Inputs To Infer

Infer these from the user request unless they are explicit:

- `source_scope`: `repo`, `file`, `feature`, `concept`, or `interview_topic`
- `question_format`: `qa`, `multiple_choice`, `drag_and_drop`, or `mixed`
- `learning_mode`: `bloom`, `socratic`, `interview`, or `mixed`
- `bloom_level`: `remember`, `understand`, `apply`, `analyze`, `evaluate`,
  `create`, `mixed`, or `auto`

Do not add separate `difficulty`, `deck_style`, or `include_answers` controls.
Bloom level handles cognitive depth when needed, templates own output syntax,
and answers plus explanations are always included.

## Workflow

1. Identify the source scope and learning goal.
2. Choose the question format:
   - Q&A for explanation and direct recall.
   - Multiple choice for distinguishing similar concepts.
   - Drag-and-drop for ordered flows, sequences, and lifecycles.
   - Mixed when one concept benefits from multiple retrieval patterns.
3. Choose the learning mode:
   - Bloom for cognitive-depth progression.
   - Socratic for guided reasoning.
   - Interview for job-ready articulation.
   - Mixed when the learner needs both study and explanation practice.
4. Use `bloom_level` only when `learning_mode` is `bloom` or `mixed`.
5. Inspect the smallest truthful source context before generating repo-grounded
   or source-grounded questions.
6. Draft one learning objective per item or small card group.
7. Generate cards using the templates reference.
8. Include answer and explanation for every item.
9. Apply the quality rubric before finalizing.

## Source Grounding

For repo-grounded learning materials:

- Read owning docs first when obvious.
- Read code, configs, or contracts only as needed.
- Prefer current source surfaces over historical notes.
- If the question transfers repo knowledge into interview framing, keep the
  source-grounded fact separate from the interview explanation.

If source evidence is unavailable or the user asks for general practice, label
the output as general rather than repo-grounded.

## Persisted Outputs

When the user asks to save or create learning artifacts, write one Markdown file
per question under:

```text
C:\Users\HOANG PHI LONG DANG\OneDrive\OBSIDIAN 24 09 01\24 09 01 obsidian-go-obsidian_v.0.3.1\<project_slug>\
```

Choose `<project_slug>`:

- If user supplies `[project]` (or explicit project name), use that.
- Else use current repo folder name from working directory.
- Sanitize: lowercase ASCII, spaces to `-`, remove `* " \ / < > : | ?`, trim.


Use this filename format:

```text
YYYY-MM-DD-HH-<title>.md
```

Rules:

- Use the current local date and hour.
- Use one question per file.
- Create `<project_slug>` folder if missing.
- Start each file with the required frontmatter from the templates reference.
- Include validator-friendly metadata in frontmatter: `question_type`,
  `learning_mode`, `bloom_level`, and `source_scope`.
- Do not include `validation` metadata in frontmatter.
- Add a descriptive `##` title after frontmatter. The title summarizes the main
  concept tested.
- The title is also the filename source. Titles cannot contain these
  characters: `* " \ / < > : | ?`.
- Keep `<title>` lowercase, ASCII, hyphenated, and descriptive in the filename.
- Do not create a file for quick inline examples or brief explanations.
- Card bodies inside Markdown still use the question templates.
- Card-body formatting rule: include exactly one empty line before each `##`
  heading.

## References

Load only the reference needed for the current request:

- `references/question-formats-and-templates.md` when choosing or rendering
  Q&A, multiple-choice, drag-and-drop, ordering, or mixed card formats.
- `references/learning-modes-and-depth.md` when using Bloom, Socratic, or
  interview-oriented questioning.
- `references/output-quality-rubric.md` before finalizing generated materials
  or when checking whether a deck is good enough.

## Common Mistakes

- Do not confuse human learning skills such as MLOps with agent-control skills.
- Do not make every card multiple-choice; use flow cards when order matters.
- Do not create plausible-sounding but source-free interview answers.
- Do not use silly distractors; use real misconceptions.
- Do not overload one card with several unrelated concepts.
- Do not omit explanations, even when the answer is short.
