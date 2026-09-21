---
'@fulcro/parallel': patch
---

Keep the worker pool's promises under overlapping runs, cancellation and a
failed start.

Two runs on one pool used to share the workers, and replies carry the element's
position — which every run counts from zero — so each run read the other's
results and released workers that were still busy. Runs are now serialised: a
second `map` or `stream` waits for the one in progress, and a `stream`
therefore holds the pool until it is finished or abandoned.

A run also used to leave its message handlers registered, so a pool reused
across batches — which the documentation recommends — accumulated one set per
batch and tripped Node's listener warning on the eleventh. Handlers are now
removed when the run that registered them ends.

An abort is not a reply, so a run whose workers were all busy only noticed it
had been called off once one of them finished on its own. The signal now wakes
the run directly, and a run aborted before it starts hands out nothing at all.

Finally, a worker that failed to load left the workers that had already started
running, and a `close()` arriving during that handshake found nothing to stop.
Both now terminate what was spawned.
