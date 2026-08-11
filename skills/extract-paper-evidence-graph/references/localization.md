# Localization Sidecar

PaperGraph keeps `graph.json` in English as the canonical, validator-owned
evidence artifact. Chinese is an optional display layer, generated with the
paper context available to the extraction Agent and stored separately at
`locales/zh-CN.json`.

## Contract

```json
{
  "format_version": "papergraph-localization/0.1",
  "locale": "zh-CN",
  "source_graph_sha256": "<sha256 of canonical graph.json>",
  "paper": {
    "summary": "<short Chinese reading summary>"
  },
  "nodes": {
    "<stable node id>": {"label": "<Chinese display label>"}
  },
  "groups": {
    "<stable contribution-group id>": {"title": "<Chinese title>"}
  },
  "gaps": {
    "<stable gap id>": {
      "question": "<Chinese open question>",
      "missing_content": "<optional Chinese missing-content text>"
    }
  },
  "measurements": {
    "<stable measurement id>": {
      "label": "<Chinese metric label>",
      "qualifier": "<optional Chinese qualifier>"
    }
  }
}
```

All sections except the metadata are partial maps. A missing field is valid and
causes a field-level English fallback. An unknown ID, an invalid graph digest,
or a malformed translation must be rejected before `papergraph build` emits a
Viewer.

## Translation Rules

- Translate labels and explanatory UI-facing text, not evidence facts.
- Keep `graph.json` IDs, relation names, page numbers, locators, units, formulas,
  numeric values, and raw numeric tokens exactly unchanged.
- Keep every `evidence_spans[*].quote` in its original paper language. Do not
  put translated quotes in the sidecar.
- Preserve model names, dataset names, metric acronyms, and standard technical
  names when a Chinese translation would make the entity ambiguous; a natural
  Chinese explanation may follow the original name.
- Use the paper itself as context. Do not translate by independently querying a
  remote service after extraction, and do not add facts absent from the paper.
- If the context-aware pass cannot be completed, leave the graph valid, omit or
  remove the failed locale file, and record the fallback in the report.

The CLI consumes the sidecar explicitly:

```sh
papergraph build --graph graph.json --coverage coverage-plan.json \
  --source normalized-paper.json --locales ./locales --out ./viewer-out
```

The Viewer chooses Chinese for a Chinese browser by default, otherwise English.
A manual language choice is stored in `localStorage`. Neither choice changes
the graph, validation semantics, or evidence content.
