"""Positive + negative mechanical-validator tests.

Positive: the golden forward-test-4 graph validates with zero errors.
Negative: each test applies one focused mutation and asserts the specific
deterministic error code fires (all-errors-in-one-pass, no short-circuit).
"""
from __future__ import annotations

import copy

import pytest

from papergraph import Source, validate
from papergraph.model import GraphView


def codes(graph, coverage=None, source=None) -> set[str]:
    return set(validate(graph, coverage, source).codes())


# --- positive -----------------------------------------------------------------


def test_golden_validates_with_zero_errors(golden_graph, golden_coverage, source):
    report = validate(golden_graph, golden_coverage, source)
    assert report.valid, [e.to_dict() for e in report.errors]
    assert report.error_count == 0


def test_golden_schema_only_is_clean(golden_graph, golden_coverage):
    # No source/coverage still runs schema + structural checks cleanly.
    report = validate(golden_graph, golden_coverage, source=None)
    assert report.valid, [e.to_dict() for e in report.errors]


# --- negative: identity & references ------------------------------------------


def test_duplicate_global_id(graph, coverage, source):
    graph["nodes"][1]["id"] = graph["nodes"][0]["id"]
    assert "duplicate_id" in codes(graph, coverage, source)


def test_unknown_source_span(graph, coverage, source):
    graph["evidence_spans"][0]["source_span_ids"] = ["p99-s99"]
    assert "unknown_source_span" in codes(graph, coverage, source)


def test_quote_vs_source_mismatch(graph, coverage, source):
    # span stays valid; quote no longer occurs in the cited source span.
    graph["evidence_spans"][0]["quote"] = "this text is fabricated and absent from the paper"
    result = codes(graph, coverage, source)
    assert "quote_mismatch" in result
    assert "unknown_source_span" not in result


# --- negative: measurement ownership ------------------------------------------


def test_duplicate_route_ownership_of_reported_measurement(graph, coverage, source):
    view = GraphView(graph)
    reported = view.reported_measurement_ids()
    # a measurement already owned by route[0]; add it to another route too.
    owned = set(graph["provenance_routes"][0]["measurement_ids"]) & reported
    victim = sorted(owned)[0]
    other = next(r for r in graph["provenance_routes"] if victim not in r["measurement_ids"])
    other["measurement_ids"].append(victim)
    assert "measurement_multiple_routes" in codes(graph, coverage, source)


# --- negative: route structure ------------------------------------------------


def test_wrong_path_edge_endpoint(graph, coverage, source):
    route = graph["provenance_routes"][0]
    edges_by_id = GraphView(graph).edges_by_id()
    correct = route["path_edge_ids"][0]
    a, b = route["path"][0], route["path"][1]
    # substitute a different, still-resolvable edge whose endpoints differ.
    wrong = next(
        eid for eid, e in edges_by_id.items()
        if eid != correct and (e.get("from") != a or e.get("to") != b)
    )
    route["path_edge_ids"][0] = wrong
    assert "route_edge_endpoint_mismatch" in codes(graph, coverage, source)


def test_gap_adjacent_slot_not_null(graph, coverage, source):
    route = next(r for r in graph["provenance_routes"] if r.get("gap_ids"))
    null_index = next(i for i, pe in enumerate(route["path_edge_ids"]) if pe is None)
    some_edge = graph["edges"][0]["id"]
    route["path_edge_ids"][null_index] = some_edge
    assert "route_gap_adjacent_not_null" in codes(graph, coverage, source)


def test_illegal_branch_edge(graph, coverage, source):
    route = graph["provenance_routes"][0]
    declared = set(route.get("additional_input_ids", [])) | set(route.get("configuration_ids", []))
    # an edge whose 'from' is not a declared branch input for this route.
    illegal = next(
        e["id"] for e in graph["edges"] if e.get("from") not in declared
    )
    route["branch_edge_ids"].append(illegal)
    assert "route_branch_edge_illegal" in codes(graph, coverage, source)


# --- negative: contribution groups --------------------------------------------


def test_empty_contribution_group(graph, coverage, source):
    cg = graph["contribution_groups"][0]
    cg["member_node_ids"] = []
    cg["headline_claim_ids"] = []
    assert "contribution_group_empty" in codes(graph, coverage, source)


def test_ungrouped_headline_claim(graph, coverage, source):
    """A Claim absent from every group's headline_claim_ids is unreachable in
    the first-layer view and must be flagged (unsupported claims included)."""
    claim_id = next(n["id"] for n in graph["nodes"] if n["kind"] == "claim")
    for cg in graph["contribution_groups"]:
        cg["headline_claim_ids"] = [c for c in cg.get("headline_claim_ids", []) if c != claim_id]
    result = codes(graph, coverage, source)
    assert "ungrouped_headline_claim" in result


# --- negative: coverage reconciliation ----------------------------------------


def test_coverage_plan_missing_row(graph, coverage, source):
    included = next(
        r["region"] for r in graph["result_region_scan"] if r.get("decision") == "included_full"
    )
    coverage["result_regions"] = [
        r for r in coverage["result_regions"] if r.get("locator") != included
    ]
    assert "coverage_missing_row" in codes(graph, coverage, source)


# --- negative: node reserved fields -------------------------------------------


def test_claim_fields_nested_in_details(graph, coverage, source):
    claim = next(n for n in graph["nodes"] if n["kind"] == "claim")
    claim["details"] = {"claim_form": claim["claim_form"]}
    assert "kind_field_in_details" in codes(graph, coverage, source)


# --- negative: privacy & mechanical grounding (P7 repeatability findings) -----


def test_private_source_path_rejected(graph, coverage, source):
    graph["paper"]["source_path"] = "/home/alice/papers/main.pdf"
    assert "private_source_path" in codes(graph, coverage, source)


def test_windows_source_path_rejected(graph, coverage, source):
    graph["paper"]["source_path"] = "C:\\Users\\alice\\paper.pdf"
    assert "private_source_path" in codes(graph, coverage, source)


def test_relative_source_path_is_clean(graph, coverage, source):
    graph["paper"]["source_path"] = "input/main.pdf"
    assert "private_source_path" not in codes(graph, coverage, source)


def test_measurement_raw_text_not_in_quote(graph, coverage, source):
    # raw_text no longer matches the value printed in its own evidence quote
    # (the exact class of silent-truncation bug the P7 findings caught: a
    # paired value like "15/16" quietly recorded as just "15").
    node = next(n for n in graph["nodes"] if n["kind"] == "result" and n.get("measurements"))
    node["measurements"][0]["raw_text"] = "999.9 -- not printed anywhere"
    assert "measurement_raw_text_not_in_quote" in codes(graph, coverage, source)


def test_measurement_raw_text_cannot_be_assembled_across_quotes(graph, coverage):
    node = next(n for n in graph["nodes"] if n["kind"] == "result" and n.get("measurements"))
    measurement = node["measurements"][0]
    measurement["raw_text"] = "1.8 · 10^20"
    measurement["numeric_value"] = 1.8e20
    measurement["evidence_ids"] = ["ev_p1_s01", "ev_p1_s02"]
    evidence_a = next(ev for ev in graph["evidence_spans"] if ev["id"] == "ev_p1_s01")
    evidence_b = next(ev for ev in graph["evidence_spans"] if ev["id"] == "ev_p1_s02")
    evidence_a["quote"] = "Reported training cost: 1.8 ·"
    evidence_b["quote"] = "10^20 FLOPs"
    assert "measurement_raw_text_not_in_quote" in codes(graph, coverage)


def test_incomplete_scientific_notation_rejected(graph, coverage):
    node = next(n for n in graph["nodes"] if n["kind"] == "result" and n.get("measurements"))
    measurement = node["measurements"][0]
    measurement["raw_text"] = "1.8 · 10"
    measurement["numeric_value"] = 1.8e19
    evidence_id = measurement["evidence_ids"][-1]
    evidence = next(ev for ev in graph["evidence_spans"] if ev["id"] == evidence_id)
    evidence["quote"] = "Reported training cost: 1.8 · 10 FLOPs"
    assert "measurement_incomplete_scientific_notation" in codes(graph, coverage)


def test_incomplete_scientific_notation_can_remain_unparsed(graph, coverage):
    node = next(n for n in graph["nodes"] if n["kind"] == "result" and n.get("measurements"))
    measurement = node["measurements"][0]
    measurement["raw_text"] = "1.8 · 10"
    measurement["numeric_value"] = None
    evidence_id = measurement["evidence_ids"][-1]
    evidence = next(ev for ev in graph["evidence_spans"] if ev["id"] == evidence_id)
    evidence["quote"] = "Reported training cost: 1.8 · 10 FLOPs"
    assert "measurement_incomplete_scientific_notation" not in codes(graph, coverage)


def test_complete_scientific_notation_must_match_numeric_value(graph, coverage):
    node = next(n for n in graph["nodes"] if n["kind"] == "result" and n.get("measurements"))
    measurement = node["measurements"][0]
    measurement["raw_text"] = "1.8 · 10^20"
    measurement["numeric_value"] = 1.8e19
    evidence_id = measurement["evidence_ids"][-1]
    evidence = next(ev for ev in graph["evidence_spans"] if ev["id"] == evidence_id)
    evidence["quote"] = "Reported training cost: 1.8 · 10^20 FLOPs"
    assert "measurement_numeric_value_mismatch" in codes(graph, coverage)


def test_complete_scientific_notation_with_matching_value_is_clean(graph, coverage):
    node = next(n for n in graph["nodes"] if n["kind"] == "result" and n.get("measurements"))
    measurement = node["measurements"][0]
    measurement["raw_text"] = "1.8 · 10^20"
    measurement["numeric_value"] = 1.8e20
    evidence_id = measurement["evidence_ids"][-1]
    evidence = next(ev for ev in graph["evidence_spans"] if ev["id"] == evidence_id)
    evidence["quote"] = "Reported training cost: 1.8 · 10^20 FLOPs"
    result = codes(graph, coverage)
    assert "measurement_incomplete_scientific_notation" not in result
    assert "measurement_numeric_value_mismatch" not in result


@pytest.mark.parametrize("raw_text", ["1.8e20", "1.8 × 10²⁰", "1.8 · 1020"])
def test_supported_scientific_notation_forms_are_checked(graph, coverage, raw_text):
    node = next(n for n in graph["nodes"] if n["kind"] == "result" and n.get("measurements"))
    measurement = node["measurements"][0]
    measurement["raw_text"] = raw_text
    measurement["numeric_value"] = 1.8e20
    evidence_id = measurement["evidence_ids"][-1]
    evidence = next(ev for ev in graph["evidence_spans"] if ev["id"] == evidence_id)
    evidence["quote"] = f"Reported training cost: {raw_text} FLOPs"
    assert "measurement_numeric_value_mismatch" not in codes(graph, coverage)


def test_plain_scalar_must_match_numeric_value(graph, coverage, source):
    node = next(n for n in graph["nodes"] if n["kind"] == "result" and n.get("measurements"))
    node["measurements"][0]["numeric_value"] = 71.3
    assert "measurement_numeric_value_mismatch" in codes(graph, coverage, source)


def test_locator_quote_number_mismatch(graph, coverage, source):
    ev = graph["evidence_spans"][0]
    ev["locator"] = "Table 1"
    ev["quote"] = "As shown in Table 2, " + ev["quote"]
    # source=None: this check is graph-internal (locator/quote fields only),
    # and mutating the quote here would otherwise also trip quote_mismatch
    # against the real source text, which is a different, unrelated check.
    assert "locator_quote_number_mismatch" in codes(graph, coverage)


def test_locator_without_number_is_clean(graph, coverage, source):
    ev = graph["evidence_spans"][0]
    ev["locator"] = "Method"
    assert "locator_quote_number_mismatch" not in codes(graph, coverage, source)
