"""The golden fixture: a wholly synthetic paper (CC0-1.0, see fixtures/
synthetic/LICENSE) used by this whole test suite.

Deliberately covers, in one small graph: an explicit edge, a reconstructed
edge, a branch edge, two provenance routes with distinct measurement
ownership, an unsupported claim backed by a gap, and both claims present in a
contribution group's headline_claim_ids.
"""
from __future__ import annotations

import json
from pathlib import Path

from papergraph import Source, validate

_DIR = Path(__file__).resolve().parent / "fixtures" / "synthetic"


def _load(name: str) -> dict:
    return json.loads((_DIR / name).read_text(encoding="utf-8"))


def test_synthetic_golden_validates_with_zero_errors():
    graph = _load("graph.json")
    coverage = _load("coverage-plan.json")
    source = Source.from_path(_DIR / "paper.json")
    report = validate(graph, coverage, source)
    assert report.valid, [e.to_dict() for e in report.errors]
    assert report.error_count == 0


def test_synthetic_golden_has_an_unsupported_claim_gap():
    graph = _load("graph.json")
    gap = next(g for g in graph["gaps"] if g["category"] == "unsupported_claim")
    assert gap["affects"] == ["clm_synthnet_generalizes"]


def test_synthetic_golden_both_claims_are_grouped():
    graph = _load("graph.json")
    claim_ids = {n["id"] for n in graph["nodes"] if n["kind"] == "claim"}
    grouped = {cid for cg in graph["contribution_groups"] for cid in cg["headline_claim_ids"]}
    assert claim_ids <= grouped
