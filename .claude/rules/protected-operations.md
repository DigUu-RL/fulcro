# Some operations are not the agent's to perform

**Scope:** every Claude Code session in this repository

`.claude/CLAUDE.md` says pushing and publishing stay human-controlled. That
sentence held only as long as the model remembered it, which is the wrong place
for a property that must hold at the end of a long session as firmly as at the
start. `.claude/hooks/` enforces it instead.

Two guards run before every `Bash` and `PowerShell` call:

| Hook                    | Refuses                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `protect-publish.mjs`   | `git push`, any `publish`, `npm run release`, `gh pr merge`    |
| `block-destructive.mjs` | `git reset --hard`, `git clean --force`, deleting the checkout |

A third, `post-edit-check.mjs`, runs after a write and only reports: emitted
output written beside its source, which `.gitignore` hides and the test runner
turns into a broken import hours later. See `build-output.md`. It never fixes
and never deletes — the fix is the tsconfig, and removing the file would hide
the bug the report exists to expose.

## Why these, and not a longer list

The operations above share one property: the repository cannot take them back.
A bad commit is amended and a bad build is rebuilt, but a version on npm is
permanent, a branch pushed to `main` has already run the release, and
uncommitted work discarded by `--hard` was never written down anywhere else.
Everything reversible keeps its ordinary permission prompt. A guard that made
`rm -rf dist` awkward would be worked around within a day, and a worked-around
guard protects nothing.

`permissions.deny` in `.claude/settings.json` lists the same commands, but the
hooks are the enforcement. Permission patterns match on a prefix, so
`npm run build && git push` does not look like a push to them; the hooks split
a line into the commands it actually runs and read each one.

## How a human performs a blocked operation

Outside the agent, in their own terminal — that is the point of the block, not
a limitation of it.

- **Push:** Claude commits and says the branch is ready; you run `git push`.
- **Publish:** nothing is published by hand. Claude records the bump with
  `npm run changeset`; the release workflow publishes from `main` after the
  pull request merges.
- **Merge:** you merge the pull request, on GitHub or with `gh pr merge`.
- **Discard work:** `git restore <path>` or `git stash` name what goes, which
  is what `--hard` refuses to do.

## Re-opening one for a session

Set `FULCRO_HOOKS_ALLOW` in the environment **before starting Claude Code**,
to the identifiers to re-open, separated by commas:

| Identifier    | Re-opens                             |
| ------------- | ------------------------------------ |
| `push`        | `git push`                           |
| `publish`     | every publish, including the release |
| `merge`       | `gh pr merge`                        |
| `reset-hard`  | `git reset --hard`                   |
| `clean`       | `git clean --force`                  |
| `delete-tree` | deleting the checkout or above       |

```pwsh
$env:FULCRO_HOOKS_ALLOW = 'reset-hard'; claude
```

The hook reads the variable from the environment Claude Code itself was started
in. Claude cannot set it — not by exporting it in a shell, not by editing a
settings file, not by asking — because each hook is spawned afresh from the
session's environment. Re-opening an operation therefore costs a human closing
the session and starting it again, which is exactly the deliberate act the
exception is meant to be.

## What follows from it

- A refusal is not a puzzle. There is no alternative spelling to find, and
  looking for one is the behaviour the hook exists to stop.
- A new guard needs a case in `tests/hooks/` for what it refuses **and** for
  what it must keep allowing. Both halves are the rule.
- Never widen a rule to catch a shape nobody runs. Every false refusal spends
  the credibility the true ones rely on.
- Never put a token, a password or a path to a secret in a hook. They run on
  every call and their output reaches the transcript.
