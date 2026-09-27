---
'@fulcro/functions': major
---

Add `Result` and `Option`, each handled exhaustively with `handle`, and make `tryCatch` return the new `Result`.

**Breaking:** a result's value is now `value`, not `data` — replace `result.data` with `result.value`. `Success` and `Failure` now take both type parameters (`Success<T, E>`, `Failure<T, E>`), and a result carries the methods `isSuccess()`, `isFailure()` and `handle()`, so an object literal `{ data, error }` no longer satisfies `Result`; build one with `success(value)` or `failure(error)`. `error === null` still tells the two variants apart.

New: `success`, `failure`, `ResultCases`; `Option`, `Some`, `None`, `OptionCases`, `some`, `none` and `optionOf`.
