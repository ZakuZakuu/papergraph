"""Contract and build-product tests for optional localization sidecars."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from papergraph import cli
from papergraph.localization import (
    LOCALIZATION_FORMAT_VERSION,
    LocalizationError,
    graph_digest,
    load_localizations,
)

_GOLDEN_DIR = Path(__file__).resolve().parent / "fixtures" / "synthetic"
_GRAPH = _GOLDEN_DIR / "graph.json"
_COVERAGE = _GOLDEN_DIR / "coverage-plan.json"
_SOURCE = _GOLDEN_DIR / "paper.json"


def _payload(graph: dict) -> dict:
    node = graph["nodes"][0]
    group = graph["contribution_groups"][0]
    gap = graph["gaps"][0]
    measurement = next(
        measurement
        for item in graph["nodes"]
        for measurement in item.get("measurements", [])
    )
    return {
        "format_version": LOCALIZATION_FORMAT_VERSION,
        "locale": "zh-CN",
        "source_graph_sha256": graph_digest(graph),
        "paper": {"summary": "合成论文演示"},
        "nodes": {node["id"]: {"label": "中文节点"}},
        "groups": {group["id"]: {"title": "中文贡献"}},
        "gaps": {gap["id"]: {"question": "中文缺口问题"}},
        "measurements": {measurement["id"]: {"label": "中文指标"}},
    }


def test_localization_sidecar_loads_and_is_partial() -> None:
    graph = json.loads(_GRAPH.read_text(encoding="utf-8"))
    loaded = load_localizations_from_payload(graph, _payload(graph))
    assert loaded["zh-CN"]["nodes"]


def load_localizations_from_payload(graph: dict, payload: dict) -> dict:
    """Exercise the same validator used by directory loading without I/O."""
    from papergraph.localization import validate_localization

    checked = validate_localization(payload, graph)
    return {checked["locale"]: checked}


def test_localization_rejects_stale_graph_digest() -> None:
    graph = json.loads(_GRAPH.read_text(encoding="utf-8"))
    payload = _payload(graph)
    payload["source_graph_sha256"] = "0" * 64
    with pytest.raises(LocalizationError, match="source_graph_sha256"):
        load_localizations_from_payload(graph, payload)


def test_render_copies_locale_and_inlines_it(tmp_path: Path) -> None:
    graph = json.loads(_GRAPH.read_text(encoding="utf-8"))
    locales = tmp_path / "locales"
    locales.mkdir()
    (locales / "zh-CN.json").write_text(
        json.dumps(_payload(graph), ensure_ascii=False), encoding="utf-8"
    )
    out = tmp_path / "viewer"
    rc = cli.main([
        "build", "--graph", str(_GRAPH), "--coverage", str(_COVERAGE),
        "--source", str(_SOURCE), "--locales", str(locales), "--out", str(out),
    ])
    assert rc == cli.EXIT_OK

    manifest = json.loads((out / cli.VIEWER_MANIFEST_FILE).read_text(encoding="utf-8"))
    assert manifest["locale_files"] == {"zh-CN": "locales/zh-CN.json"}
    copied = out / cli.VIEWER_DATA_DIR / "locales" / "zh-CN.json"
    assert json.loads(copied.read_text(encoding="utf-8"))["locale"] == "zh-CN"
    standalone = (out / cli.VIEWER_STANDALONE_FILE).read_text(encoding="utf-8")
    assert '"zh-CN"' in standalone
    assert "中文节点" in standalone


def test_render_rejects_locale_for_another_graph(tmp_path: Path) -> None:
    graph = json.loads(_GRAPH.read_text(encoding="utf-8"))
    locales = tmp_path / "locales"
    locales.mkdir()
    payload = _payload(graph)
    payload["source_graph_sha256"] = "f" * 64
    (locales / "zh-CN.json").write_text(json.dumps(payload), encoding="utf-8")
    out = tmp_path / "viewer"
    rc = cli.main([
        "render", "--graph", str(_GRAPH), "--source", str(_SOURCE),
        "--locales", str(locales), "--out", str(out),
    ])
    assert rc == cli.EXIT_USAGE
    assert not out.exists()
