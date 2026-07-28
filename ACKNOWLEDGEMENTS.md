# Acknowledgements & Provenance

## UI design language

The viewer's floating force-directed graph presentation (fixed-until-dragged
nodes, alpha-cooling physics, a floating glass inspector panel, a left rail
with search/filters/stats) was designed with the visual language of
[Obsidian](https://obsidian.md)'s graph view and
[GitNexus](https://github.com/nxpatterns/gitnexus)'s node visualization as a
reference for *look and feel* only. No source code, assets, fonts, or data
from either project were copied, vendored, or linked into this repository.
The viewer (`src/papergraph/viewer/`) is an original, from-scratch
implementation in vanilla HTML/CSS/JS with zero third-party runtime
dependencies.

## Component origin

`papergraph` (the CLI, the schema/validator, and the viewer) was designed and
implemented by the project's own contributors as part of an internal
reproducibility-assessment research effort, then migrated into this
independent repository for public release. It does not include, import, or
derive from any GPL-licensed code; the `Source`/`normalize_display` span
lookup in `src/papergraph/source.py` is a clean-room, stdlib-only
reimplementation written specifically for this project.

## Test fixtures

`tests/fixtures/synthetic/` is a wholly invented paper ("SynthNet"), written
for this repository's public test suite. It is dedicated to the public domain
under CC0-1.0 — see `tests/fixtures/synthetic/LICENSE`. The repository's code
is Apache-2.0 (see `LICENSE`); only this fixture directory carries the
separate CC0-1.0 dedication.
