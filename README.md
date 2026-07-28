# papergraph

A format-only validator and a static, self-contained force-directed viewer for
**paper evidence graphs** — a structured representation of a paper's
artifacts, procedures, configurations, results, and claims, with every edge
and result traced back to an exact quote in the source paper.

Pure Python standard library. Zero runtime dependencies. Zero external
references in the viewer (no CDN, no fonts, no network calls).

## For agents: extract a graph, then visualize it

Install the extraction skill:

```
npx skills add USER/papergraph --skill extract-paper-evidence-graph
```

Or, for any agent that can fetch a URL, one line:

> Read
> https://raw.githubusercontent.com/USER/papergraph/main/skills/extract-paper-evidence-graph/SKILL.md
> and follow it to extract this paper's evidence graph. Then `pip install
> papergraph` (or download `papergraph.pyz` from the Releases page) and run
> `papergraph build` to visualize it.

## CLI

```
pip install papergraph
```

or, with no Python packaging step at all — download `papergraph.pyz` from a
GitHub Release and run `python3 papergraph.pyz ...`.

```
papergraph validate --graph graph.json --coverage coverage-plan.json --source paper.json
papergraph build    --graph graph.json --coverage coverage-plan.json --source paper.json --out ./viewer-out
```

`validate` checks structural conformance only — it never judges whether a
claim is actually well-supported, only whether the graph is well-formed and
every quote is genuinely present in the cited source span. `build` validates,
then emits a viewer directory; open `viewer-out/index.standalone.html`
directly in a browser (no server needed).

## Format

Graphs conform to `paper-evidence-graph/0.2` (schema at
`src/papergraph/schemas/graph-schema.json`); coverage plans conform to
`paper-evidence-coverage/0.1`. The schema is the single executable source of
truth — `skills/extract-paper-evidence-graph/references/graph-contract.md` is
a human-facing mirror of it.

## Development

```
pip install -e .
pytest
```

See `ACKNOWLEDGEMENTS.md` for design-language and provenance notes, and
`tests/fixtures/synthetic/LICENSE` for the test fixture's separate CC0-1.0
dedication.

## License

Apache-2.0 — see `LICENSE`.
