---
'@fulcro/reflect': major
'@fulcro/types': major
---

- `@fulcro/reflect`: `TypeLayout<T>['fields']` for a type whose layout lists no fields is `Readonly<Record<string, never>>`, every field name leading to nothing, instead of `{}`, which stood for any value at all.
- `@fulcro/types`: the methods parameter of a struct's descriptor no longer defaults to `{}`. `StructType<TFields>` written without methods now means methods in general, and the descriptor of a struct declared without methods carries, as its second argument, a marker that holds one optional slot, `'~noMethods'`, and no method. Every struct still assigns to `StructType<any>`, to `StructType<Record<string, any>>` and to `StructType<TFields>` of its own fields, with methods or without, and the values of every struct are typed exactly as before.

  What can break: code that reads the methods argument back out of a descriptor. `typeof Plain extends StructType<infer F, infer M>` infers `M` as that marker where it inferred `{}`, so `keyof M` is `'~noMethods'` rather than `never`; and an editor shows the marker as the second argument of `typeof Plain`. `Struct<typeof Plain>` is the way to ask for a struct's values, and it is unchanged.
