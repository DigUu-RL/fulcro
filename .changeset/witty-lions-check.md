---
'@fulcro/reflect': minor
'@fulcro/collections': minor
'@fulcro/transform-core': minor
---

`is<T>()` and `as<T>()` check a single value against a type.

Structural validation was only reachable through a sequence, which meant
wrapping one value in a collection to ask about it. These ask directly:

```ts
if (is<Order>(payload)) {
	payload.total; // narrowed, and actually verified
}

const order = as<Order>(await response.json());
```

`is` is a type guard, for when a failure should branch. `as` is the checked
counterpart of the language's own `as` — which asserts without verifying — and
returns the value unchanged or throws.

A failing `as` names **where** it stopped matching:

```text
TypeError: as<Order>() refused a value: customer.email: expected string, got number
```

That comes from a second walker the transformer emits beside the fast check, and
it runs only once the check has already refused, so a passing value never pays
for it. `is` carries no walker, since a branch needs yes or no.

The structural generator moved to `@fulcro/transform-core`, so the sequences and
these share one implementation rather than two that could drift. Nothing about
`ofType` or `cast` changed.

Index signatures and unresolved generics are refused, loudly. Pass a test of
your own for those.
