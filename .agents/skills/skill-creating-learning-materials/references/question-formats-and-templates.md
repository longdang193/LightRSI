# Question Formats And Templates

This reference owns output syntax for generated learning items.

## Required File Structure

Persisted outputs use one Markdown file per question.

Each file must begin with frontmatter:

```yaml
---
aliases: []
status: []
time: YYYY-MM-DD-HH-MM-SS-N
tags:
  - "#ai-102"
  - "#ANKI"
TARGET DECK: AI-102::MEASUREUP
question_type: qa | multiple_choice | drag_and_drop
learning_mode: bloom | socratic | interview | mixed
bloom_level: remember | understand | apply | analyze | evaluate | create | mixed | auto
source_scope: repo | file | feature | concept | interview_topic
---
```

Do not include `validation` metadata in frontmatter; structure is defined by the
card body template instead.

Then add a descriptive Markdown heading:

```markdown
## [Filename-Safe Question Title]
```

The title summarizes the main topic or concept tested. It is also used as the
filename source, so it cannot contain these characters:

```text
* " \ / < > : | ?
```

Use filename format:

```text
docs/learning/YYYY-MM-DD-HH-<title>.md
```

## Instructions

1. **Follow the structure exactly** including the keywords `SSTART`, `EEND`, and
   `T-F_Obsidian` in uppercase.
2. Each question must begin with a **descriptive title** in Markdown heading
   format (`##`) summarizing the main topic or concept tested. Titles cannot
   contain any of these characters: `* " \ / < > : | ?`.
3. Use `...` for **inline code** examples, such as `NULL` or
   `CASE WHEN ... THEN ... END`.
4. Use **fenced code blocks** for **multi-line code examples**.
5. Ensure **concise, educational explanations** under `E:` that clearly explain
   why each option is right or wrong when options are present.
6. Apply this structure to **all questions** in the quiz output.

## Format Selection

- Use Q&A when explanation, recall, or interview articulation matters.
- Use multiple choice when the learner must distinguish similar concepts.
- Use drag-and-drop or ordering when sequence, lifecycle, flow, or dependency
  order matters.
- Use mixed format when one topic needs several retrieval patterns.

## Q&A Template

Use for definitions, plain-language explanations, short interview answers, and
concept checks.

```text
SSTART

T-F_Obsidian-v2

Q: [Question]

A: [Answer]

E: [Explanation]

EEND
```

### Q&A Sample

```text
---
aliases: []
status: []
time: 2026-02-19-12-10-25-1
tags:
  - "#ai-102"
  - "#ANKI"
TARGET DECK: AI-102::MEASUREUP
question_type: qa
learning_mode: interview
bloom_level: understand
source_scope: concept
---
## Release Record Source Of Truth

SSTART

T-F_Obsidian-v2

Q:

In an MLOps workflow, why should a release record be treated as the source of
truth for what model was approved?

A: A release record ties the official approval decision to the model version,
evidence, metrics, thresholds, and lineage used for that decision.

E:

A model artifact only proves that a model exists. A release record proves which
candidate was officially approved and why, so monitoring and deployment checks
should anchor on it before interpreting later evidence.

EEND
```

## Multiple Choice Template

Use for distinction questions, misconceptions, boundary checks, and
scenario-based judgment where one option is best.

```text
SSTART

T-F_Obsidian-v2

Q: [Question]
A. [Option A]
B. [Option B]
C. [Option C]
D. [Option D]

A: [Answer]

E: [Explanation]

EEND
```

Guidance:

- Make exactly one option the best answer.
- Distractors should be plausible and based on real misunderstandings.
- Avoid joke answers unless the learner explicitly wants a playful deck.
- The explanation should teach why the correct answer is right and why the main
  trap is wrong.

### Multiple Choice Sample

```text
---
aliases: []
status: []
time: 2026-02-19-12-10-25-2
tags:
  - "#ai-102"
  - "#ANKI"
TARGET DECK: AI-102::MEASUREUP
question_type: multiple_choice
learning_mode: interview
bloom_level: apply
source_scope: concept
---
## Monitoring Baseline Evidence

SSTART

T-F_Obsidian-v2

Q:

When monitoring a released model, which evidence should be trusted first to know
what model was officially approved?

A. The latest model artifact in the output folder
B. The release record
C. The most recent captured payload file
D. The console output from the training command

A: B

E:

B is correct because the release record is the official approval evidence. A is
wrong because a model artifact can exist without being approved. C is wrong
because capture evidence describes observed traffic, not release approval. D is
wrong because console output is not durable release evidence.

EEND
```

## Drag-And-Drop / Ordering Template

Use for flows, lifecycle stages, handoffs, architecture sequences, debugging
order, and pipeline ordering.

```text
SSTART

T-F_Obsidian-v2

Q: [Question]

items:

1::[Correct first step]
2::[Correct second step]
3::[Correct third step]
🔴::[Distractor 1],,[Distractor 2],,[Distractor 3]

E: [Explanation]

EEND
```

Guidance:

- Only use this format when order matters.
- Keep each step short and comparable.
- Put the correct answer after `::`.
- Use `🔴::` for incorrect steps that are plausible but not part of the flow.
- Separate multiple distractors after `🔴::` with `,,`.
- The explanation should state why the order matters.

### Drag-And-Drop / Ordering Sample

```text
---
aliases: []
status: []
time: 2026-02-19-12-10-25-3
tags:
  - "#ai-102"
  - "#ANKI"
TARGET DECK: AI-102::MEASUREUP
question_type: drag_and_drop
learning_mode: bloom
bloom_level: apply
source_scope: concept
---
## Knowledge Mining Implementation Flow

SSTART

T-F_Obsidian-v2

Q:

You are a data scientist at a large multinational corporation. Your company
collects and stores business data in both structured and unstructured formats.
Structured data resides in databases, while unstructured data includes PDFs,
images, videos, and audio files.

The company wants to implement a knowledge mining solution to extract insights
and support strategic decision-making.

Which three steps should you take to implement a knowledge mining solution?
Arrange the actions in the correct order.

items:

1::Ingest and aggregate content.

2::Use AI capabilities to enrich data with new insights.

3::Explore data and discover patterns.

🔴::Create a new image classification project.,,Train the image classifier.,,Evaluate the image classifier.

E:

Knowledge mining starts by ingesting content, then enriching it with AI skills,
and finally exploring the enriched data for patterns and insights. The image
classification steps are distractors because they describe a custom vision
workflow, not the general knowledge mining pipeline.

EEND
```

## Mixed Format

Use mixed format when a topic benefits from several learning angles:

- one Q&A card for core meaning
- one multiple-choice card for a boundary or misconception
- one drag-and-drop card for the sequence or handoff

Mixed decks should still keep each card atomic.
