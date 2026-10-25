---
'@fulcro/reflect': major
'@fulcro/types': minor
---

- `@fulcro/reflect`: `TypeLayout<T>['fields']` for a type whose layout lists no fields is `Readonly<Record<string, never>>`, every field name leading to nothing, instead of `{}`, which stood for any value at all.
- `@fulcro/types`: `StructType<TFields>` written without methods now defaults its second parameter to a type that holds no method, instead of `{}`. The values of a struct without methods are typed exactly as before.
