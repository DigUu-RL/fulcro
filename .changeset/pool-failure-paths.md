---
'@fulcro/parallel': minor
'@fulcro/errors': minor
---

Keep the worker pool's promises when something goes wrong. A closed pool now stays closed: a run started afterwards, or one still waiting for its turn when the pool closed, rejects with `FULCRO3010` instead of starting threads that nothing would close, and `close()` settles only once every worker is gone, including those a cancelled run is still stopping. A run still waiting for its turn rejects as soon as its signal aborts, and a `stream` stops its workers at the abort even while its consumer is busy with the last result. On Node, a worker that fails while no run is using it no longer ends the process with an uncaught exception, and the next run replaces it instead of waiting on a thread that is gone.
