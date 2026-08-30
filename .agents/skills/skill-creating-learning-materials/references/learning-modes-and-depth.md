# Learning Modes And Depth

Learning mode controls the teaching purpose. It is separate from question
format.

## Bloom's Taxonomy

Use Bloom mode when the learner wants progressive cognitive depth.

| Level | Use For | Example Stem |
| --- | --- | --- |
| `remember` | names, definitions, artifacts, commands | What is a release record? |
| `understand` | plain-language meaning | Why is a release record treated as source of truth? |
| `apply` | using a concept in a scenario | Which evidence should you inspect after a failed deployment? |
| `analyze` | boundaries, causes, comparisons, tradeoffs | How is promotion evidence different from release approval? |
| `evaluate` | judgment, adequacy, risk | Is bounded monitoring enough for production? |
| `create` | designing an improvement or new workflow | Design an input-drift extension for this monitoring flow. |

Rules:

- Use `bloom_level` only when `learning_mode` is `bloom` or `mixed`.
- Do not add a separate difficulty field.
- A mixed Bloom deck should move from lower levels to higher levels.

## Socratic Mode

Use Socratic mode when the learner should reason their way into the answer.

Good Socratic prompts ask:

- What evidence would prove this?
- What should not be inferred from this artifact?
- Which source or stage owns this decision?
- What would break if this assumption were false?
- What tradeoff is being made?
- What is the smallest proof that this workflow succeeded?

Socratic questions may still use Q&A or multiple-choice templates, but their
purpose is guided reasoning rather than recall.

## Interview Mode

Use interview mode when the learner needs job-ready articulation.

Good interview questions ask the learner to explain:

- the engineering reason behind a design
- production tradeoffs
- failure modes
- validation evidence
- boundaries between lifecycle stages
- business or operational impact
- a resume or portfolio story

Interview answers should be concise but complete. Strong answers usually name:

- the problem
- the decision
- the evidence or validation
- the tradeoff
- the impact

## Mixed Mode

Use mixed mode when the learner needs both study depth and communication
practice.

Recommended order:

1. Bloom `remember` or `understand` card for the core concept.
2. Socratic question for reasoning.
3. Interview question for job-ready explanation.
