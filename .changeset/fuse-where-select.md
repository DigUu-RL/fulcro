---
'@fulcro/collections': patch
---

Adjacent `where` and `select` stages of a sequence are now traversed by one loop instead of one generator per stage; results, call order and early termination are unchanged.
