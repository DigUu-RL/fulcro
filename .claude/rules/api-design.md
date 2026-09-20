# The public surface is a promise, and it is reviewed

**Scope:** the `exports` map, the exported values and the exported types of
every package

`.claude/CLAUDE.md` calls a change to a package's public surface deliberate
review territory. This is what counts as one and what a proposal has to say.

## What the surface is

More than the list of exported names. A consumer can observe, and will depend
on, all of this:

- the `exports` map of `package.json` and every entry point in it;
- the exported values, their parameters and their overloads;
- the exported types, and the types a signature returns or accepts;
- **what a call infers.** A signature that returns `Sequence<unknown>` where it
  used to return `Sequence<User>` breaks every consumer without changing a
  single name.

Inference is part of correctness, not a nicety. A change that keeps every name
and loosens one inferred type is a breaking change, and only a type-level test
catches it — the runtime suite passes throughout.

## Nothing is exported by accident

A symbol is exported because a consumer needs it, not because a sibling module
does. What one module needs from another travels by an internal path; the
barrel is the public list and reads as one.

That cuts both ways for the transformer entry points: `./transformer` and
`./unplugin` are public surface too, and a helper exposed there to make a test
easier is a helper the package now supports.

## How a change to it is proposed

Separately, and in words, before it is written in. The proposal says which
names or inferred types change, what a consumer's code looks like before and
after, whether a deprecation can carry them across, and what the bump is —
major if anything above stops compiling for somebody.

Do not slip a surface change in alongside an implementation change. Bundled
together the diff reads as a fix, and the one line that mattered is reviewed by
nobody. `git.md` says where the version bump is recorded once the change is
agreed.

## Names are kept

Renaming an export to something clearer costs every consumer an edit and buys
them nothing. Add the better name, keep the old one pointing at it, and let the
next major remove it.

New overloads are additive only. An overload inserted ahead of an existing one
changes which signature an existing call selects, which is a break wearing an
addition's clothes.
