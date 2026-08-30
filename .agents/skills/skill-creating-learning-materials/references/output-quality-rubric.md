# Output Quality Rubric

Use this rubric before finalizing generated learning materials.

## Core Quality Checks

A good learning item has:

- one main learning objective
- one question per persisted Markdown file
- required frontmatter when persisted
- validator-friendly metadata that names `question_type`, `learning_mode`,
  `bloom_level`, and `source_scope`
- a filename-safe `##` title that summarizes the concept tested
- one expected answer or one best answer
- source-grounded context when the user requested repo/source-grounded material
- an explanation that teaches the distinction
- appropriate format for the learning goal
- no accidental ambiguity

## Source Grounding

Repo-grounded cards should be answerable from inspected source material.

Acceptable source material includes:

- current docs
- code
- configs
- feature or stage contracts
- specs and plans when the requested topic is planning history

If an item is an interview transfer question, the explanation should separate:

- the repo-grounded fact
- the interview framing or generalization

## Atomicity

Prefer one concept per card.

Avoid:

- asking two unrelated questions at once
- requiring a long essay answer for a simple card
- combining definition, sequence, and critique into one item

Split overloaded cards into smaller cards.

## Multiple Choice Quality

A good multiple-choice question has:

- exactly one best answer
- plausible distractors
- distractors based on real misconceptions
- answer options that are similar in length and style
- an explanation of the key distinction

Reject:

- joke distractors
- obviously impossible options
- options where two answers could reasonably be correct
- explanations that only repeat the answer letter

## Drag-And-Drop Quality

A good drag-and-drop item has:

- a real ordering dependency
- short, comparable steps
- plausible incorrect steps marked with `🔴::`
- an explanation of why the sequence matters

Reject drag-and-drop when:

- order does not matter
- the steps are vague nouns rather than actions
- the distractors are unrelated to the flow

## Socratic Quality

A good Socratic question:

- invites reasoning rather than recall only
- asks about evidence, assumptions, boundaries, or tradeoffs
- can be answered from the selected source material or from explicit reasoning
  over it

Avoid Socratic questions that are so broad the learner cannot tell what concept
is being tested.

## Interview Quality

A good interview-oriented item:

- asks for a clear explanation a candidate could say aloud
- includes a model answer or answer outline
- names tradeoffs and failure modes when relevant
- connects implementation detail to operational or business impact

Avoid:

- buzzword-only answers
- answers that cannot be defended with repo evidence
- overlong answers that sound memorized rather than understood

## Final Pass

Before finalizing, ask:

- Is this grounded in the requested source?
- Does each persisted file contain exactly one question?
- Does the file include required frontmatter and a filename-safe title?
- Does frontmatter omit `validation` metadata?
- Is the format appropriate?
- Is the answer unambiguous?
- Does the explanation teach something?
- Would this help the learner answer a follow-up question?
