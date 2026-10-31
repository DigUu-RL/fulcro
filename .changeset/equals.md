---
'@fulcro/functions': minor
'@fulcro/errors': minor
---

Add `equals`, which compares two values by what they hold, and `createEquals`, which makes a variant of it that compares some kinds of value by rules of your own — the descriptor of every type of `@fulcro/types` among them. `@fulcro/errors` registers the two codes `createEquals` refuses its rules with, `FULCRO2002` and `FULCRO2003`.
