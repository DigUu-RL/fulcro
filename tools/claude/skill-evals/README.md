# Skill evals

One file per skill, named for it: `<skill>.eval.json`. Each holds the
invocations that must trigger it, the ones that must not, and the near misses
that show where the boundary is — the same three the standard asks every skill
to carry as examples, written where a machine can count them.

`node tools/claude/validate-skills.mjs` validates the shape of every file here
and reports a skill whose suite is missing a positive, a negative or an edge
case. **What it does not do is run them.** Deciding whether a prompt triggers a
skill needs a model, and a harness that pretended otherwise would report a pass
nobody measured. These files are the scenarios a person or a session replays
against a changed skill, and the structural pass is what keeps them honest in
the meantime.

## The shape

```json
{
	"skill": "fix-warnings",
	"cases": [
		{
			"id": "asked-for-the-warnings",
			"kind": "positive",
			"prompt": "List every warning in the project.",
			"expect": {
				"invokes": true,
				"output": "A table of warnings, then the two-option question."
			}
		}
	]
}
```

| Field            | Means                                                        |
| ---------------- | ------------------------------------------------------------ |
| `skill`          | The skill's `name`, matching the file name                   |
| `id`             | Unique within the file; what a failure is reported as        |
| `kind`           | `positive`, `negative` or `edge`                             |
| `prompt`         | What the user says                                           |
| `expect.invokes` | Whether the skill is the right answer to that prompt         |
| `expect.output`  | The shape the run has to produce — required where it invokes |
| `expect.refuses` | What the skill must decline to do, where that is the point   |
| `why`            | Optional. Why an edge case sits where it does                |

A case that invokes the skill states its output shape, because a case nobody
can judge is not a case. `expect.refuses` is for the skills that stop: a step
reserved for a human, a fix that needs approval first.
