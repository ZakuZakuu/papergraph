# Ticket 002: Bilingual Viewer and Gap Tiers

**Status:** Complete
**Target:** `0.1.6`

## Checklist

- [x] Add a graph-digest-checked localization sidecar loader.
- [x] Add optional `--locales` support to `render`, `build`, and `serve`.
- [x] Inline locale data in standalone Viewer builds and copy it into served
  `data/locales/` output.
- [x] Add browser-language detection, persistent manual language switching, and
  static/dynamic Viewer translations.
- [x] Keep source quotes, numeric values, units, formulas, and locators intact.
- [x] Classify core versus detail Gaps in the Viewer projection.
- [x] Hide detail Gaps in Compact mode while preserving user-triggered reveal.
- [x] Add muted detail-Gap Canvas/list styles and light-theme coverage.
- [x] Add localization, manifest, standalone, and Viewer marker tests.
- [x] Update the extraction Skill to generate and validate `zh-CN.json`.
- [ ] Build and inspect Transformer, Du-IN, and ACPC locale-backed demos.
- [ ] Run online packaging and release verification before tagging `v0.1.6`.

## Verification Notes

Local Viewer/CLI tests pass. The repository's isolated wheel test remains
blocked in the current offline environment because the build frontend attempts
to download `setuptools>=68`; this is an environment limitation and must be
re-run in CI or a networked build environment before release.
