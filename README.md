<div align="center">

# PaperGraph

<strong>Extract, validate, and explore paper evidence graphs.</strong>

<p>
  <a href="README.md">English</a>
  &nbsp;|&nbsp;
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p>
  <a href="https://github.com/ZakuZakuu/papergraph/releases/latest"><img src="https://img.shields.io/github/v/release/ZakuZakuu/papergraph?display_name=tag&sort=semver&style=flat-square" alt="Latest release"></a>
  <a href="https://pypi.org/project/papergraph/"><img src="https://img.shields.io/pypi/v/papergraph?style=flat-square" alt="PyPI"></a>
  <a href="https://github.com/ZakuZakuu/papergraph/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ZakuZakuu/papergraph/ci.yml?branch=main&style=flat-square&label=tests" alt="Tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-4E7D5B?style=flat-square" alt="Apache-2.0 license"></a>
  <img src="https://img.shields.io/badge/runtime-Python%203.10%2B-3B6EA5?style=flat-square" alt="Python 3.10 or newer">
  <img src="https://img.shields.io/badge/dependencies-zero-5E5CE6?style=flat-square" alt="Zero runtime dependencies">
</p>

</div>

papergraph pairs an agent-facing extraction skill with a small CLI and a static interactive viewer. It turns a paper into a structured graph of artifacts, procedures, configurations, results, claims, and source-grounded relations.

![papergraph viewer screenshot](docs/assets/demo-screenshot.png)

## See it in action

- **Live demo:** [Attention Is All You Need](https://zakuzakuu.github.io/papergraph/demo/attention-is-all-you-need/) with an [attribution and research-use notice](docs/demo/attention-is-all-you-need/NOTICE.md).
- **Viewer workflow:** start from headline claims, inspect the evidence routes behind them, open a particular result when needed, and make unsupported claims or open gaps visible rather than hiding them.

The live demo contains selected excerpts and graph data from a cited research paper, not its PDF or original figures. Read its notice before reuse. Local research runs may use other papers, but their extracted quotes and graph artifacts are intentionally not part of this repository.

## Use with an agent

Give an agent the prompt below, then provide the paper as a path, URL, or attachment. The skill handles CLI setup, validation, and viewer generation, and asks before it downloads or installs anything.

```text
Read the PaperGraph extraction skill at:
https://github.com/ZakuZakuu/papergraph/tree/main/skills/extract-paper-evidence-graph

Read SKILL.md and every file it requires in references/. Follow the skill to
extract and visualize an evidence graph for the paper provided below.

<PASTE A PDF PATH, PAPER URL, OR ATTACH THE PAPER HERE>
```

The resulting viewer is fully static and works without a running server.

## How PaperGraph fits together

| Layer | Responsibility |
| --- | --- |
| **Extraction skill** | Guides an Agent through coverage planning, evidence-grounded extraction, self-review, and the final CLI gate. |
| **PaperGraph CLI** | Validates the JSON contract and assembles a portable viewer. It has zero runtime dependencies and can run from a pinned `.pyz` bundle. |
| **Static viewer** | Opens the generated graph locally in a browser. It provides Claim-first reading, provenance routes, compact/full Result views, and source-linked inspection. |

The repository mirrors that structure: `skills/` contains the extraction instructions, `src/papergraph/` contains the CLI and bundled viewer, and `tests/` protects the contract and packaging behavior.

## Manual setup

If you prefer to configure and run the tool yourself, install from PyPI:

```bash
pip install papergraph
```

Or download the zero-install `papergraph.pyz` artifact from a GitHub Release:

```bash
python3 papergraph.pyz validate --graph graph.json --coverage coverage-plan.json --source paper.json
python3 papergraph.pyz build --graph graph.json --coverage coverage-plan.json --source paper.json --out ./viewer-out
```

With the installed command-line entry point, the equivalent is:

```bash
papergraph validate --graph graph.json --coverage coverage-plan.json --source paper.json
papergraph build --graph graph.json --coverage coverage-plan.json --source paper.json --out ./viewer-out
```

Open `viewer-out/index.standalone.html` in any modern browser. It is one self-contained HTML file: no server, CDN, font download, or network call is required.

## What validation means

papergraph validates **format and provenance structure**, not scholarly truth. It checks that the graph conforms to the contract and that cited quotes occur in their declared source spans. It does not decide whether a claim is scientifically justified, whether evidence is sufficient, or whether an extraction model made a sound interpretation. Treat the graph as an inspectable research aid, not an automatic verdict on a paper.

## Format and compatibility

- Graph format: `paper-evidence-graph/0.2`
- Coverage plan format: `paper-evidence-coverage/0.1`
- Python: 3.10+
- Runtime dependencies: none (Python standard library only)

The executable schemas live in `src/papergraph/schemas/`. The skill's [`graph-contract.md`](skills/extract-paper-evidence-graph/references/graph-contract.md) is the human-facing mirror.

## Development

```bash
git clone https://github.com/ZakuZakuu/papergraph.git
cd papergraph
python3 -m pip install -e ".[dev]"
pytest
```

Project behavior and long-lived decisions live in [`docs/`](docs/README.md). See [`ACKNOWLEDGEMENTS.md`](ACKNOWLEDGEMENTS.md) for viewer design-language and provenance notes. The synthetic test fixture is separately dedicated under CC0-1.0 at `tests/fixtures/synthetic/LICENSE`.

## License

Apache-2.0. See [LICENSE](LICENSE).
