"""End-to-end CLI tests driven through ``cli.main([...])``.

Covers the exact exit-code contract (0 valid / 1 invalid / 2 usage) and the
render/build stub-viewer layout, plus the unit-testable validate-then-serve gate.
These exercise the *wrapper*; the format rules themselves are covered by
``test_validator.py``.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest

from papergraph import cli

_GOLDEN_DIR = Path(__file__).resolve().parent / "fixtures" / "synthetic"
_GRAPH = _GOLDEN_DIR / "graph.json"
_COVERAGE = _GOLDEN_DIR / "coverage-plan.json"
_SOURCE = _GOLDEN_DIR / "paper.json"


def _write(tmp_path: Path, name: str, data) -> Path:
    p = tmp_path / name
    p.write_text(json.dumps(data), encoding="utf-8")
    return p


# --- validate: happy path -----------------------------------------------------


def test_validate_golden_exit_0(capsys):
    rc = cli.main(["validate", "--graph", str(_GRAPH),
                   "--coverage", str(_COVERAGE), "--source", str(_SOURCE)])
    assert rc == cli.EXIT_OK
    out = capsys.readouterr().out
    assert "VALID" in out


def test_validate_report_written_well_formed(tmp_path, capsys):
    report_path = tmp_path / "graph.lint.json"
    rc = cli.main(["validate", "--graph", str(_GRAPH),
                   "--coverage", str(_COVERAGE), "--source", str(_SOURCE),
                   "--report", str(report_path)])
    assert rc == cli.EXIT_OK
    assert report_path.exists()
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert payload["valid"] is True
    assert payload["error_count"] == 0
    assert payload["errors"] == []


# --- validate: invalid graph -> exit 1 ----------------------------------------


def test_validate_tampered_graph_exit_1(tmp_path, capsys):
    graph = json.loads(_GRAPH.read_text(encoding="utf-8"))
    graph["nodes"][1]["id"] = graph["nodes"][0]["id"]  # duplicate id
    bad = _write(tmp_path, "graph.json", graph)
    report_path = tmp_path / "r.json"
    rc = cli.main(["validate", "--graph", str(bad),
                   "--coverage", str(_COVERAGE), "--source", str(_SOURCE),
                   "--report", str(report_path)])
    assert rc == cli.EXIT_INVALID
    out = capsys.readouterr().out
    assert "INVALID" in out
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert payload["valid"] is False
    assert payload["error_count"] >= 1
    assert any(e["code"] == "duplicate_id" for e in payload["errors"])


# --- usage errors -> exit 2 ---------------------------------------------------


def test_missing_file_exit_2(capsys):
    rc = cli.main(["validate", "--graph", "/no/such/graph.json"])
    assert rc == cli.EXIT_USAGE
    assert "not found" in capsys.readouterr().err


def test_malformed_json_exit_2(tmp_path, capsys):
    bad = tmp_path / "graph.json"
    bad.write_text("{not valid json", encoding="utf-8")
    rc = cli.main(["validate", "--graph", str(bad)])
    assert rc == cli.EXIT_USAGE
    assert "not valid JSON" in capsys.readouterr().err


def test_missing_required_arg_exit_2(capsys):
    rc = cli.main(["validate", "--coverage", str(_COVERAGE)])  # no --graph
    assert rc == cli.EXIT_USAGE


def test_no_subcommand_exit_2():
    assert cli.main([]) == cli.EXIT_USAGE


# --- render / build -----------------------------------------------------------


def test_render_golden_installs_real_viewer(tmp_path, capsys):
    out = tmp_path / "view"
    rc = cli.main(["render", "--graph", str(_GRAPH),
                   "--coverage", str(_COVERAGE), "--source", str(_SOURCE),
                   "--out", str(out)])
    assert rc == cli.EXIT_OK
    # Issue 04: the real viewer replaces the stub. No STUB marker remains.
    index = out / cli.VIEWER_INDEX_FILE
    assert index.exists()
    index_text = index.read_text(encoding="utf-8")
    assert "STUB" not in index_text
    # served build references its sibling assets + reads the data contract.
    assert cli.VIEWER_APP_FILE in index_text
    assert cli.VIEWER_STYLES_FILE in index_text
    assert (out / cli.VIEWER_APP_FILE).exists()
    assert (out / cli.VIEWER_STYLES_FILE).exists()
    manifest = json.loads((out / cli.VIEWER_MANIFEST_FILE).read_text(encoding="utf-8"))
    assert manifest["stub"] is False
    assert manifest["validated"] is True
    # validated inputs still copied into data/ (contract intact)
    assert (out / cli.VIEWER_DATA_DIR / cli.VIEWER_GRAPH_FILE).exists()
    assert (out / cli.VIEWER_DATA_DIR / cli.VIEWER_COVERAGE_FILE).exists()
    assert (out / cli.VIEWER_DATA_DIR / cli.VIEWER_SOURCE_FILE).exists()


def test_build_golden_creates_viewer(tmp_path):
    out = tmp_path / "build"
    rc = cli.main(["build", "--graph", str(_GRAPH),
                   "--coverage", str(_COVERAGE), "--source", str(_SOURCE),
                   "--out", str(out)])
    assert rc == cli.EXIT_OK
    assert (out / cli.VIEWER_INDEX_FILE).exists()
    assert (out / cli.VIEWER_STANDALONE_FILE).exists()


def test_render_invalid_graph_exit_1_no_artifact(tmp_path):
    graph = json.loads(_GRAPH.read_text(encoding="utf-8"))
    graph["nodes"][1]["id"] = graph["nodes"][0]["id"]
    bad = _write(tmp_path, "graph.json", graph)
    out = tmp_path / "should-not-exist"
    rc = cli.main(["render", "--graph", str(bad),
                   "--coverage", str(_COVERAGE), "--source", str(_SOURCE),
                   "--out", str(out)])
    assert rc == cli.EXIT_INVALID
    # fail-closed: no viewer directory left behind for an invalid graph.
    assert not out.exists()


# --- serve gate (no live socket) ----------------------------------------------


def test_serve_gate_renders_when_valid(tmp_path):
    out = tmp_path / "served"
    args = argparse.Namespace(
        graph=str(_GRAPH), coverage=str(_COVERAGE), source=str(_SOURCE),
        out=str(out), serve_root=None,
    )
    serve_dir = cli.resolve_serve_dir(args)
    assert Path(serve_dir).exists()
    assert (Path(serve_dir) / cli.VIEWER_INDEX_FILE).exists()


def test_serve_gate_raises_on_invalid(tmp_path):
    graph = json.loads(_GRAPH.read_text(encoding="utf-8"))
    graph["nodes"][1]["id"] = graph["nodes"][0]["id"]
    bad = _write(tmp_path, "graph.json", graph)
    out = tmp_path / "served"
    args = argparse.Namespace(
        graph=str(bad), coverage=str(_COVERAGE), source=str(_SOURCE),
        out=str(out), serve_root=None,
    )
    with pytest.raises(cli.CliError) as ei:
        cli.resolve_serve_dir(args)
    assert ei.value.code == cli.EXIT_INVALID
    assert not out.exists()


# --- boundary: inputs never mutated -------------------------------------------


def test_inputs_never_mutated(tmp_path):
    before = _GRAPH.read_text(encoding="utf-8")
    cli.main(["validate", "--graph", str(_GRAPH),
              "--coverage", str(_COVERAGE), "--source", str(_SOURCE)])
    assert _GRAPH.read_text(encoding="utf-8") == before
