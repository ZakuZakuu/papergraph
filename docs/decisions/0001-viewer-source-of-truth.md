# ADR 0001: Viewer Source of Truth

Status: accepted

## Context

During early work, several generated viewer directories accumulated under
workspace scratch paths. One later demo contained a newer Compact/Full viewer
than the package source, so `papergraph build` could emit an older page than a
manually served artifact.

## Decision

The only release source for viewer assets is:

```text
src/papergraph/viewer/{app.js,index.html,styles.css}
```

`papergraph build` copies those exact assets into its output. The tests verify
that source and output match, that the Compact/Full, Claim-browser, and
provenance-tree entry points are present, and that the manifest records the
same graph format as the copied graph.

Scratch viewers are generated deliverables. They may be used as a documented
recovery reference, but never as a direct packaging input.

## Recovery Record

The `v0.1.3` recovery imported the independently verified final viewer from
the Attention Is All You Need demo. Its source asset SHA-256 values were:

```text
app.js      2cc059823169ed1eedb3f31747fdcf2a169686285e30b81df7a7b1a5abda03e7
index.html  252f55a17f53d6a164b6d9c63f03c8e2e624e84200b8db3c11789f36e4f7b0c0
styles.css  a277495d1c5d7b5f0779785d01cf1cf1d9cbf3b495d1435b4f3c34a084c8d62b
```

Future viewer changes must begin in `src/`, be tested through `papergraph
build`, and be committed before a demo is treated as an acceptance artifact.
