# Spec 002: Bilingual Viewer and Gap Tiers

**Status:** Implemented on `codex/localization-gap-tiers` for `0.1.6`

## Problem

PaperGraph's evidence graph is useful to readers who work in either English or
Chinese, but translating the graph after extraction would lose the paper context
and risk changing evidence facts. Separately, a long extraction can contain
many technically valid but low-priority Gaps that overwhelm the first viewport.

## Decisions

1. `graph.json` remains the single canonical English evidence artifact.
2. The extraction Agent produces a context-aware `locales/zh-CN.json` sidecar
   after graph validation. The sidecar is keyed by stable IDs and carries a
   canonical graph digest.
3. Evidence quotes, raw numbers, units, formulas, locators, and identifiers are
   never translated.
4. The Viewer selects Chinese for a Chinese browser by default, otherwise
   English; an explicit choice persists locally.
5. Missing locale fields fall back independently to English. A failed optional
   translation pass does not invalidate an otherwise valid graph.
6. Compact mode hides detail-tier Gaps. Full mode shows all Gaps. A detail Gap
   selected from the Open Questions card is temporarily revealed in Compact
   mode for inspection.
7. Core Gap categories remain visually prominent. Detail-tier Gaps use a muted
   red treatment in the Canvas and Open Questions card.

## Gap Classification

Core tier:

- `unsupported_claim`
- `ambiguous_mapping`
- `unconnected_result`
- any Gap that directly affects a Claim

Detail tier:

- `missing_evaluator`
- `underspecified_configuration`
- `missing_producer`
- `missing_artifact`
- `other`

This is a Viewer projection only. It does not change graph schema, validator
semantics, extraction rules, or route incidence.

## Acceptance

- The CLI rejects a locale sidecar whose graph digest or IDs do not match.
- Served and standalone builds include valid locale data when supplied.
- The Viewer has a working `中 | EN` switch with field-level fallback.
- Compact/Full visibility and temporary detail-Gap reveal work without mutating
  graph data.
- Existing English-only builds continue to work without `--locales`.
- Original quotes and measurements remain unchanged in both languages.
