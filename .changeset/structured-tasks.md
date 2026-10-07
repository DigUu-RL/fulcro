---
'@fulcro/parallel': minor
'@fulcro/errors': minor
---

Add structured tasks with cancellation, for work that waits rather than computes. `createTaskScope({ concurrency?, token? })` returns a `TaskScope` whose `spawn(work)` starts a `Task<T>` — awaitable for its value, with `settled` as a `Result` and `cancel()` for that task alone — and whose `join()` waits for every task. No task outlives its scope: `await using` calls off what is still running and waits for it. With `concurrency`, a task beyond the limit waits unstarted. The first task to fail calls the others off and `join` rejects with it; a failure nobody joined is thrown when the scope is disposed. `createCancellationSource(parent?)` returns the `CancellationSource` and `CancellationToken` behind it, whose `signal` is an ordinary `AbortSignal`. New codes: `FULCRO3011` for a spawn into an ended scope, `FULCRO3012` for a concurrency that is not a positive integer, `FULCRO3013` for a task that rejects with `null` or `undefined`. `@fulcro/parallel` now depends on `@fulcro/functions`.
