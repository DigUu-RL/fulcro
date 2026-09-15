---
'@fulcro/parallel': minor
---

First release.

A worker pool for work that is not waiting on anything — parsing, hashing,
compressing, transforming — on the browser and on Node from one implementation
rather than two.

The work is named rather than captured, and that is the API's one constraint. A
worker is a separate realm, and a closure's captured scope is not serialisable,
so a function cannot cross into one; libraries that appear to accept a closure
either stringify it and lose that scope silently, or re-import the calling
module and hope it has no side effects. Naming a module export instead is a
thing that genuinely crosses — and `new URL(…, import.meta.url)` is also the
form every major bundler recognises as a worker entry.

`map` returns results in input order; `stream` yields them as they finish and is
a plain `AsyncIterable`, so it feeds `AsyncSequenceCollection.from` without this
package depending on the sequences.

Workers start on the first run rather than at construction, so a pool nobody
uses costs no threads — and a pool that has run must be closed, since threads
keep a Node process alive.

The suite asserts the unflattering half too: that four workers beat one on
genuinely heavy work, and that a cold pool loses to a warm one on trivial work.
Below some amount of work per element, threads cost more than they save, and
saying so is more use than a benchmark that only shows the good case.
