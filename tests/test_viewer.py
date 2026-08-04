"""Issue 04 -- generic Web Viewer tests.

These assert the *build products* of ``papergraph render/build``:

* the real viewer assets (index.html/app.js/styles.css) plus the self-contained
  ``index.standalone.html`` are emitted and non-empty and reference the
  manifest/data contract;
* the standalone file inlines the graph data and pulls in no external resources;
* ``app.js`` is structurally sound (no obvious syntax error).

Full interactive/browser testing is the planner's manual step; these are the
cheap mechanical guardrails.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from papergraph import cli

_GOLDEN_DIR = Path(__file__).resolve().parent / "fixtures" / "synthetic"
_GRAPH = _GOLDEN_DIR / "graph.json"
_COVERAGE = _GOLDEN_DIR / "coverage-plan.json"
_SOURCE = _GOLDEN_DIR / "paper.json"

_VIEWER_SRC = Path(cli.__file__).resolve().parent / "viewer"

# The only tolerated http(s) tokens anywhere in the viewer: the SVG namespace
# URI (a namespace identifier, never a network fetch) and the project's own
# GitHub link (an <a href> the user must click -- never auto-fetched, unlike
# a CDN script/font/img src, which is what this guard actually exists to catch).
_SVG_NS = "http://www.w3.org/2000/svg"
_REPO_LINK = "https://github.com/ZakuZakuu/papergraph"
_ALLOWED_EXTERNAL = {_SVG_NS, _REPO_LINK}


@pytest.fixture(scope="module")
def built(tmp_path_factory) -> Path:
    out = tmp_path_factory.mktemp("view")
    rc = cli.main(["build", "--graph", str(_GRAPH), "--coverage", str(_COVERAGE),
                   "--source", str(_SOURCE), "--out", str(out)])
    assert rc == cli.EXIT_OK
    return out


# --- assets present, non-empty, wired to the contract -------------------------


def test_all_viewer_files_emitted(built: Path):
    for name in (cli.VIEWER_INDEX_FILE, cli.VIEWER_APP_FILE, cli.VIEWER_STYLES_FILE,
                 cli.VIEWER_STANDALONE_FILE, cli.VIEWER_MANIFEST_FILE):
        p = built / name
        assert p.exists(), f"missing {name}"
        assert p.stat().st_size > 0, f"empty {name}"
    assert (built / cli.VIEWER_DATA_DIR).is_dir()


def test_index_references_assets_and_manifest_data(built: Path):
    index = (built / cli.VIEWER_INDEX_FILE).read_text(encoding="utf-8")
    assert cli.VIEWER_APP_FILE in index
    assert cli.VIEWER_STYLES_FILE in index
    app = (built / cli.VIEWER_APP_FILE).read_text(encoding="utf-8")
    # served build reads the manifest + data files by name (fetch contract)
    assert cli.VIEWER_MANIFEST_FILE in app
    assert "data_files" in app
    assert "__PAPERGRAPH_DATA__" in app  # inline-first, else fetch


def test_current_claim_first_viewer_features_are_packaged(built: Path):
    """Keep the recovered Compact viewer from silently regressing to legacy UI."""
    index = (built / cli.VIEWER_INDEX_FILE).read_text(encoding="utf-8")
    app = (built / cli.VIEWER_APP_FILE).read_text(encoding="utf-8")

    for marker in (
        'id="pg-mode-compact"',
        'id="pg-mode-full"',
        'id="pg-claim-browser"',
        'id="pg-detail-inspector"',
        'id="pg-layout-reset"',
    ):
        assert marker in index
    for marker in (
        "function buildCompactResultProjection",
        "function applyEvidenceFlowLayout",
        "function buildFoldedProvenanceTree",
        "function renderClaimProvenanceTree",
        "function renderDeclaredMeasurements",
        "function renderClaimSupportItem",
        "Comparative evidence",
        "comparison_result_ids",
        "comparisonResultIds",
    ):
        assert marker in app
    # Coincident nodes use an ID-stable nudge, not the missing legacy RNG helper.
    assert "rnd()" not in app


def test_manifest_format_matches_the_rendered_graph(built: Path):
    manifest = json.loads((built / cli.VIEWER_MANIFEST_FILE).read_text(encoding="utf-8"))
    graph = json.loads((built / cli.VIEWER_DATA_DIR / cli.VIEWER_GRAPH_FILE).read_text(encoding="utf-8"))
    assert manifest["format_version"] == graph["format_version"]


# --- standalone: data inlined + no external resource references ---------------


def test_standalone_inlines_graph_data(built: Path):
    html = (built / cli.VIEWER_STANDALONE_FILE).read_text(encoding="utf-8")
    assert "window.__PAPERGRAPH_DATA__" in html
    # a known node id and a known reported measurement value from the golden
    assert "res_synthnet" in html
    assert "84.5" in html
    # style + script inlined (no external <link>/<script src>)
    assert "<style>" in html
    assert '<link ' not in html
    assert '<script src=' not in html


def test_standalone_has_no_external_resource_refs(built: Path):
    html = (built / cli.VIEWER_STANDALONE_FILE).read_text(encoding="utf-8")
    lowered = html.lower()
    # no resource-loading references of any kind
    assert "src=\"http" not in lowered
    assert f'href="{_REPO_LINK}"' in html  # the one intentional, click-only <a href>
    assert lowered.count('href="http') == 1  # and nothing else masquerading as one
    assert "@import" not in lowered
    assert "url(http" not in lowered
    assert "//cdn" not in lowered
    assert "fonts.googleapis" not in lowered
    assert "fonts.gstatic" not in lowered
    # every remaining http(s) occurrence must be an allowed inert reference
    for m in re.findall(r"https?://[^\s\"'<>()\\]+", html):
        assert m in _ALLOWED_EXTERNAL, f"unexpected external URL reference: {m}"


def test_served_assets_have_no_external_refs(built: Path):
    for name in (cli.VIEWER_INDEX_FILE, cli.VIEWER_STYLES_FILE, cli.VIEWER_APP_FILE):
        text = (built / name).read_text(encoding="utf-8")
        for m in re.findall(r"https?://[^\s\"'<>()\\]+", text):
            assert m in _ALLOWED_EXTERNAL, f"{name}: unexpected external URL {m}"


# --- app.js structural soundness ----------------------------------------------


def test_app_js_no_syntax_error(built: Path):
    app_path = built / cli.VIEWER_APP_FILE
    node = shutil.which("node")
    if node:
        proc = subprocess.run([node, "--check", str(app_path)],
                              capture_output=True, text=True)
        assert proc.returncode == 0, proc.stderr
        return
    # No node available: fall back to a cheap structural check.
    src = app_path.read_text(encoding="utf-8")
    for opener, closer in (("{", "}"), ("(", ")"), ("[", "]")):
        assert src.count(opener) == src.count(closer), f"unbalanced {opener}{closer}"
    # key functions the viewer relies on must be defined
    for fn in ("function start", "function draw", "function tick",
               "function selectNode", "function renderInspector",
               "function renderClaimInspector", "function buildGroups"):
        assert fn in src, f"missing {fn}"


def test_viewer_source_matches_installed(built: Path):
    # the render step installs the package's viewer sources verbatim
    for name in (cli.VIEWER_INDEX_FILE, cli.VIEWER_APP_FILE, cli.VIEWER_STYLES_FILE):
        assert (built / name).read_text(encoding="utf-8") == \
            (_VIEWER_SRC / name).read_text(encoding="utf-8")
