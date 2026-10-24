---
'@fulcro/errors': major
---

Remove `CodedError`, deprecated since `FulcroError` replaced it, as its documentation announced for this major.

Replace `CodedError<RangeError>` with `FulcroError & RangeError`, or with `FulcroError` alone where the class does not matter; `FulcroError` also carries the error's `details`.
