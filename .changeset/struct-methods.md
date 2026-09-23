---
'@fulcro/types': minor
---

`struct()` takes an optional third argument of methods, which every value of the struct carries through one shared prototype — with `this` as the value, no bytes taken, and the layout, `equals` and the byte encoding unchanged. For a struct that declares methods, `is` also requires the value to have been made by the struct; a struct without methods behaves exactly as before.
