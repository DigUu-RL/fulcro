---
'@fulcro/parallel': patch
---

`@fulcro/parallel/worker` no longer uses a top-level `await`. It reached `node:worker_threads` through a dynamic import it had to await at the top of the module, and Node's `require` refuses a module that does: loaded that way outside a worker, it failed with `ERR_REQUIRE_ASYNC_MODULE` instead of refusing with `FULCRO3002`. It now reaches the module through `process.getBuiltinModule`, which is synchronous and present on every Node the package supports. Inside a worker, in a browser or on Node, it behaves as before.
