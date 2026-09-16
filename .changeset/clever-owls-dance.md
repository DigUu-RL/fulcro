---
'@fulcro/collections': minor
---

`ofType<T>()` and `cast<T>()` handle types that contain themselves.

A comment tree, a folder structure, a category with subcategories — ordinary
shapes that were refused until now. A type referring back to itself becomes a
function that calls itself:

```ts
interface Comment {
	id: number;
	text: string;
	replies: Comment[];
}

comments.cast<Comment>();
```

The function is built once, where the call sits rather than per element, and it
adds no name to the surrounding scope. Cycles running through a second type work
the same way, so `Author` holding `Post[]` holding an `Author` is one cycle and
gets one function.

It descends the whole value: a reply four levels down with a wrong field is
rejected like any other.

Index signatures, unresolved generics and `import type` classes are still
refused, and still loudly.
