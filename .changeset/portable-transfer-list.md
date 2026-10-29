---
'@fulcro/parallel': major
---

`RunOptions.transfer` returns `readonly object[]` rather than `readonly Transferable[]`. `Transferable` is the browser's, declared by the DOM library, so a Node project without that library and with `skipLibCheck: false` got TS2304 from inside `@fulcro/parallel`'s declarations. The browser and Node each transfer their own list of types, and neither list is declared in the other's types, so the option takes any object and the platform's `postMessage` refuses one it cannot transfer — as it already did when the type allowed what only a browser accepts.

Code that writes the option is unchanged:

```ts
await pool.map(buffers, { transfer: (buffer) => [buffer as ArrayBuffer] });
```

What breaks: code that reads the option back and hands what it returns to something typed `Transferable[]` has to say which platform's list it means. And an object that cannot be transferred, such as a plain record, now compiles and is refused by `postMessage` when the run sends it, rather than by the type checker.
