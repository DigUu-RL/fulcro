# Rule fixtures

One file per path-scoped rule, named for it:
`<rule>.fixture.json`. Each names a file the rule has to be loaded for and a
file it has to stay out of.

A rule under `.claude/rules/` that carries a `paths` block is only put in front
of a session when the file being worked on matches one of its globs. That is
the whole mechanism, and it fails in one direction: a glob with a typo, a
directory that was renamed, an extension the tree does not actually use — each
scopes the rule to nothing, and a rule scoped to nothing looks exactly like a
rule nobody needed. Nothing fails, nothing is logged, and the invariant is
simply never read again.

`node tools/claude/validate-claude-config.mjs` reads every fixture here,
matches each path against the rule's globs with the matcher in
`tools/claude/glob.mjs`, and reports a rule that would not load for a file it
claims, a rule that would load for a file it disclaims, and a path-scoped rule
with no fixture at all. The paths are checked against the repository as well:
a fixture naming a file that is not there proves nothing about a glob.

## The shape

```json
{
	"rule": "collections-performance.md",
	"loads": [
		"packages/collections/src/collections/sequence/sequence.collection.ts"
	],
	"ignores": ["packages/parallel/src/pool/index.ts"]
}
```

| Field     | Means                                                             |
| --------- | ----------------------------------------------------------------- |
| `rule`    | The rule's file name, matching this file's name                   |
| `loads`   | Files in the repository the rule must be loaded for; at least one |
| `ignores` | Files in the repository the rule must not be loaded for           |
| `why`     | Optional. Why a particular path is the interesting one            |

`ignores` is where the value is. Any glob matches something; what separates a
scope from a shrug is the neighbouring file it deliberately leaves alone.
