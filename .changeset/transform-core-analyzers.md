---
'@fulcro/transform-core': minor
---

A transformer can now check a whole file without rewriting it: `createTransformer`, `createFileTransformer` and `createTransformerUnplugin` take a list of `FileAnalyzer`s, run once per file before any rewriter. A call target can name the package that must declare it (`packageName`), so a library laid out as `<utility>/index` no longer claims a consumer's own function of the same name and folder. A file nothing rewrote now comes back from the bundler core as `null`, keeping the original and its source map.
