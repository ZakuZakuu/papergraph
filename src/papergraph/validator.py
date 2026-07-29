"""Mechanical validator for a paper-evidence-graph/0.2 document.

Implements the plan-of-record MUST-check list, reporting **every** error in one
pass (no short-circuit), with deterministic error codes. It is a purely
*structural / format* validator: it does NOT score semantic correctness, judge
claim truth, or assess evidence aptness. "Passes the validator" != "content is
correct."

Public entrypoint: ``validate(graph, coverage=None, source=None) -> LintReport``.
The CLI (Issue 03) wraps this callable; it is deliberately free of file/argv
concerns.
"""
from __future__ import annotations

import re
from typing import Any

from papergraph import model
from papergraph.model import GraphView, NODE_RESERVED_FIELDS
from papergraph.report import IssueCollector, LintReport
from papergraph.source import Source


def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _is_gap_ref(token: Any) -> bool:
    return isinstance(token, str) and token.startswith("gap_")


# --- schema -------------------------------------------------------------------


def _check_graph_schema(graph: Any, c: IssueCollector) -> None:
    for err in model.schema_errors(graph, model.graph_schema()):
        c.add("schema_invalid", err.path, err.message, layer="schema")


def _check_coverage_schema(coverage: Any, c: IssueCollector) -> None:
    for err in model.schema_errors(coverage, model.coverage_schema()):
        c.add("coverage_schema_invalid", err.path, err.message, layer="schema")


# --- global id uniqueness -----------------------------------------------------


def _check_global_id_uniqueness(view: GraphView, c: IssueCollector) -> None:
    """Every id (across all collections + measurements) is globally unique."""
    seen: set[str] = set()

    def visit(item_id: Any, where: str) -> None:
        if not isinstance(item_id, str):
            return
        if item_id in seen:
            c.add("duplicate_id", where, f"id is not globally unique: {item_id}", layer="reference")
        seen.add(item_id)

    for i, ev in enumerate(view.evidence_spans):
        visit(ev.get("id"), f"evidence_spans[{i}].id")
    for i, node in enumerate(view.nodes):
        visit(node.get("id"), f"nodes[{i}].id")
        if node.get("kind") == "result":
            for m, meas in enumerate(_as_list(node.get("measurements"))):
                visit(_as_dict(meas).get("id"), f"nodes[{i}].measurements[{m}].id")
    for i, edge in enumerate(view.edges):
        visit(edge.get("id"), f"edges[{i}].id")
    for i, gap in enumerate(view.gaps):
        visit(gap.get("id"), f"gaps[{i}].id")
    for i, route in enumerate(view.routes):
        visit(route.get("id"), f"provenance_routes[{i}].id")
    for i, cg in enumerate(view.contribution_groups):
        visit(cg.get("id"), f"contribution_groups[{i}].id")


# --- reference resolution -----------------------------------------------------


def _check_references(view: GraphView, c: IssueCollector) -> None:
    """Every id reference resolves to an existing element of the right kind."""
    ev_ids = set(view.evidence_by_id())
    node_ids = set(view.nodes_by_id())
    edge_ids = set(view.edges_by_id())
    gap_ids = set(view.gaps_by_id())
    route_ids = set(view.routes_by_id())
    cg_ids = set(view.contribution_groups and {cg["id"] for cg in view.contribution_groups if isinstance(cg.get("id"), str)})
    meas_ids = set(view.measurements_by_id())
    kinds = {nid: view.node_kind(nid) for nid in node_ids}
    result_ids = {nid for nid, k in kinds.items() if k == "result"}
    proc_ids = {nid for nid, k in kinds.items() if k == "procedure"}
    cfg_ids = {nid for nid, k in kinds.items() if k == "configuration"}
    claim_ids = {nid for nid, k in kinds.items() if k == "claim"}

    def ref(value: Any, universe: set[str], where: str, what: str) -> None:
        if isinstance(value, str) and value not in universe:
            c.add("unresolved_ref", where, f"{what} does not resolve: {value}", layer="reference")

    def refs(values: Any, universe: set[str], where: str, what: str) -> None:
        for j, value in enumerate(_as_list(values)):
            ref(value, universe, f"{where}[{j}]", what)

    # nodes: evidence + kind-specific evidence
    for i, node in enumerate(view.nodes):
        refs(node.get("evidence_ids"), ev_ids, f"nodes[{i}].evidence_ids", "evidence id")
        if node.get("kind") == "claim":
            refs(node.get("salience_evidence_ids"), ev_ids, f"nodes[{i}].salience_evidence_ids", "evidence id")
        if node.get("kind") == "result":
            for m, meas in enumerate(_as_list(node.get("measurements"))):
                refs(_as_dict(meas).get("evidence_ids"), ev_ids,
                     f"nodes[{i}].measurements[{m}].evidence_ids", "evidence id")

    # edges
    for i, edge in enumerate(view.edges):
        ref(edge.get("from"), node_ids, f"edges[{i}].from", "edge endpoint")
        ref(edge.get("to"), node_ids, f"edges[{i}].to", "edge endpoint")
        refs(edge.get("evidence_ids"), ev_ids, f"edges[{i}].evidence_ids", "evidence id")
        refs(edge.get("measurement_ids"), meas_ids, f"edges[{i}].measurement_ids", "measurement id")
        refs(edge.get("comparison_result_ids"), result_ids, f"edges[{i}].comparison_result_ids", "result id")

    # gaps
    for i, gap in enumerate(view.gaps):
        for j, aff in enumerate(_as_list(gap.get("affects"))):
            if isinstance(aff, str) and aff not in node_ids and aff not in route_ids:
                c.add("unresolved_ref", f"gaps[{i}].affects[{j}]",
                      f"gap affects unknown node/route: {aff}", layer="reference")
        refs(gap.get("between"), node_ids, f"gaps[{i}].between", "node id")

    # routes
    for i, route in enumerate(view.routes):
        ref(route.get("result_id"), result_ids, f"provenance_routes[{i}].result_id", "result id")
        refs(route.get("subject_procedure_ids"), proc_ids, f"provenance_routes[{i}].subject_procedure_ids", "procedure id")
        subj_out = route.get("subject_output_id")
        if isinstance(subj_out, str):
            ref(subj_out, node_ids, f"provenance_routes[{i}].subject_output_id", "artifact id")
        variant = _as_dict(route.get("subject_variant"))
        refs(variant.get("condition_evidence_ids"), ev_ids,
             f"provenance_routes[{i}].subject_variant.condition_evidence_ids", "evidence id")
        refs(variant.get("distinguishing_configuration_ids"), cfg_ids,
             f"provenance_routes[{i}].subject_variant.distinguishing_configuration_ids", "configuration id")
        refs(route.get("measurement_ids"), meas_ids, f"provenance_routes[{i}].measurement_ids", "measurement id")
        for j, token in enumerate(_as_list(route.get("path"))):
            if isinstance(token, str) and token not in node_ids and token not in gap_ids:
                c.add("unresolved_ref", f"provenance_routes[{i}].path[{j}]",
                      f"path element does not resolve to a node or gap: {token}", layer="reference")
        refs(route.get("additional_input_ids"), node_ids, f"provenance_routes[{i}].additional_input_ids", "node id")
        refs(route.get("configuration_ids"), cfg_ids, f"provenance_routes[{i}].configuration_ids", "configuration id")
        refs(route.get("gap_ids"), gap_ids, f"provenance_routes[{i}].gap_ids", "gap id")
        for j, pe in enumerate(_as_list(route.get("path_edge_ids"))):
            if isinstance(pe, str):
                ref(pe, edge_ids, f"provenance_routes[{i}].path_edge_ids[{j}]", "edge id")
        refs(route.get("branch_edge_ids"), edge_ids, f"provenance_routes[{i}].branch_edge_ids", "edge id")

    # contribution groups
    for i, cg in enumerate(view.contribution_groups):
        refs(cg.get("member_node_ids"), node_ids, f"contribution_groups[{i}].member_node_ids", "node id")
        refs(cg.get("headline_claim_ids"), claim_ids, f"contribution_groups[{i}].headline_claim_ids", "claim id")
        refs(cg.get("salience_evidence_ids"), ev_ids, f"contribution_groups[{i}].salience_evidence_ids", "evidence id")

    # scans
    for i, h in enumerate(view.headline_scan):
        refs(h.get("evidence_ids"), ev_ids, f"headline_scan[{i}].evidence_ids", "evidence id")
        for j, tid in enumerate(_as_list(h.get("target_ids"))):
            if isinstance(tid, str) and tid not in (node_ids | cg_ids | route_ids | gap_ids):
                c.add("unresolved_ref", f"headline_scan[{i}].target_ids[{j}]",
                      f"headline target does not resolve: {tid}", layer="reference")
    for i, reg in enumerate(view.result_region_scan):
        refs(reg.get("evidence_ids"), ev_ids, f"result_region_scan[{i}].evidence_ids", "evidence id")
        refs(reg.get("extracted_result_ids"), result_ids, f"result_region_scan[{i}].extracted_result_ids", "result id")


# --- evidence spans vs authoritative source -----------------------------------


def _check_evidence_source(view: GraphView, source: Source | None, c: IssueCollector) -> None:
    if source is None:
        return
    for i, ev in enumerate(view.evidence_spans):
        span_ids = _as_list(ev.get("source_span_ids"))
        for j, sid in enumerate(span_ids):
            if not source.has_span(sid):
                c.add("unknown_source_span", f"evidence_spans[{i}].source_span_ids[{j}]",
                      f"source span not present in authoritative source: {sid}", layer="reference")
        quote = ev.get("quote")
        # Only run the quote check when the cited spans all exist (otherwise the
        # unknown_source_span error above already covers the failure).
        if span_ids and all(source.has_span(s) for s in span_ids):
            if not source.quote_occurs(quote, span_ids):
                c.add("quote_mismatch", f"evidence_spans[{i}].quote",
                      f"quote is not found in the cited source spans: {ev.get('id')}", layer="structural")


# --- nodes: reserved fields not nested in details -----------------------------


def _check_node_reserved_fields(view: GraphView, c: IssueCollector) -> None:
    for i, node in enumerate(view.nodes):
        details = node.get("details")
        if not isinstance(details, dict):
            continue
        for reserved in NODE_RESERVED_FIELDS:
            if reserved in details:
                c.add("kind_field_in_details", f"nodes[{i}].details.{reserved}",
                      f"kind-specific field {reserved!r} must live at the node top level, not in details")


# --- source path privacy -------------------------------------------------------


_ABS_PATH_RE = re.compile(r"^(?:/|[A-Za-z]:[\\/]|\\\\)")


def _check_source_path_privacy(view: GraphView, c: IssueCollector) -> None:
    """``paper.source_path`` must be shareable: relative, redacted, or a
    basename -- never a private absolute filesystem path that leaks a real
    user's home directory or username into every copy of the graph."""
    paper = _as_dict(view.raw.get("paper"))
    path = paper.get("source_path")
    if isinstance(path, str) and _ABS_PATH_RE.match(path):
        c.add("private_source_path", "paper.source_path",
              f"source_path looks like a private absolute filesystem path ({path!r}); "
              "use a relative path, a basename, or a redacted placeholder", layer="privacy")


# --- measurement raw_text grounding --------------------------------------------


def _check_measurement_raw_text_grounded(view: GraphView, c: IssueCollector) -> None:
    """Every reported ``raw_text`` (the literal printed token, e.g. ``15/16`` or
    ``15.2 +/- 2.0%``) must occur verbatim in at least one evidence quote the
    measurement itself cites. Catches silent value truncation (e.g. a paired
    value ``15/16`` recorded as just ``15``) that schema/reference checks can't
    see. Skipped when the measurement cites no evidence (unresolved_ref, if
    the id itself is bad, is already reported by _check_references)."""
    ev_by_id = view.evidence_by_id()
    for i, node in enumerate(view.nodes):
        if node.get("kind") != "result":
            continue
        for m, meas in enumerate(_as_list(node.get("measurements"))):
            meas = _as_dict(meas)
            raw_text = meas.get("raw_text")
            if not isinstance(raw_text, str) or not raw_text.strip():
                continue
            quotes = [
                ev_by_id[eid]["quote"]
                for eid in _as_list(meas.get("evidence_ids"))
                if isinstance(eid, str) and eid in ev_by_id and isinstance(ev_by_id[eid].get("quote"), str)
            ]
            if not quotes:
                continue
            if raw_text not in " ".join(quotes):
                c.add("measurement_raw_text_not_in_quote", f"nodes[{i}].measurements[{m}].raw_text",
                      f"measurement raw_text {raw_text!r} does not occur in its evidence quote(s)",
                      layer="structural")


# --- locator vs quote table/figure number --------------------------------------


_LOCATOR_NUM_RE = re.compile(r"\b(table|figure|fig\.?)\s*(\d+)\b", re.IGNORECASE)


def _locator_kind(raw: str) -> str:
    k = raw.lower().rstrip(".")
    return "figure" if k.startswith("fig") else k


def _check_locator_quote_number_match(view: GraphView, c: IssueCollector) -> None:
    """A ``Table N``/``Figure N`` locator's quote must not itself name a
    *different* table/figure number of the same kind -- a deterministic
    signal that the wrong passage got attached to this evidence span (the
    exact class of error that produced 18 mismatches in one real extraction).
    Cross-references inside a caption are a possible false positive; this is
    a mechanical heuristic, not a semantic judgement."""
    for i, ev in enumerate(view.evidence_spans):
        locator, quote = ev.get("locator"), ev.get("quote")
        if not isinstance(locator, str) or not isinstance(quote, str):
            continue
        loc_m = _LOCATOR_NUM_RE.search(locator)
        if not loc_m:
            continue
        loc_kind, loc_num = _locator_kind(loc_m.group(1)), loc_m.group(2)
        mismatches = sorted({
            qm.group(2) for qm in _LOCATOR_NUM_RE.finditer(quote)
            if _locator_kind(qm.group(1)) == loc_kind and qm.group(2) != loc_num
        })
        if mismatches:
            c.add("locator_quote_number_mismatch", f"evidence_spans[{i}].locator",
                  f"locator {locator!r} cites {loc_kind} {loc_num} but the quote mentions "
                  f"{loc_kind} {mismatches}", layer="structural")


# --- measurement ownership ----------------------------------------------------


def _check_measurement_ownership(view: GraphView, c: IssueCollector) -> None:
    """Each reported measurement is owned by exactly one route."""
    reported = view.reported_measurement_ids()
    owners: dict[str, list[str]] = {mid: [] for mid in reported}
    for route in view.routes:
        rid = route.get("id")
        for mid in _as_list(route.get("measurement_ids")):
            if isinstance(mid, str) and mid in owners and isinstance(rid, str):
                owners[mid].append(rid)
    node_index = {}
    for i, node in enumerate(view.nodes):
        if node.get("kind") == "result":
            for m, meas in enumerate(_as_list(node.get("measurements"))):
                mid = _as_dict(meas).get("id")
                if isinstance(mid, str):
                    node_index[mid] = f"nodes[{i}].measurements[{m}]"
    for mid in sorted(reported):
        count = len(owners[mid])
        where = node_index.get(mid, f"measurement:{mid}")
        if count == 0:
            c.add("measurement_not_owned", where,
                  f"reported measurement {mid} is not owned by any provenance route")
        elif count > 1:
            c.add("measurement_multiple_routes", where,
                  f"reported measurement {mid} is owned by {count} routes: {sorted(owners[mid])}")


# --- routes -------------------------------------------------------------------


def _check_routes(view: GraphView, c: IssueCollector) -> None:
    nodes_by_id = view.nodes_by_id()
    edges_by_id = view.edges_by_id()

    for i, route in enumerate(view.routes):
        where = f"provenance_routes[{i}]"
        path = _as_list(route.get("path"))
        path_edges = _as_list(route.get("path_edge_ids"))

        # path_edge_ids length == path length - 1
        if path and len(path_edges) != len(path) - 1:
            c.add("route_path_edge_length", f"{where}.path_edge_ids",
                  f"path_edge_ids has {len(path_edges)} entries; expected path length - 1 = {len(path) - 1}")

        # route starts at an Artifact (unless the start is a localized gap)
        if path:
            start = path[0]
            if not _is_gap_ref(start) and view.node_kind(start) != "artifact":
                c.add("route_start_not_artifact", f"{where}.path[0]",
                      f"route must begin at an Artifact; path[0]={start!r} is {view.node_kind(start)!r}")

        # subject output legality: present in path when non-null; a null output
        # is only legal when a gap represents the missing output position.
        subj_out = route.get("subject_output_id")
        if isinstance(subj_out, str):
            if subj_out not in path:
                c.add("route_subject_output_not_in_path", f"{where}.subject_output_id",
                      f"subject_output_id {subj_out} does not appear in the route path")
        elif subj_out is None:
            if not any(_is_gap_ref(t) for t in path):
                c.add("route_subject_output_null_without_gap", f"{where}.subject_output_id",
                      "subject_output_id is null but the path contains no gap for the missing output")

        # positional edge alignment (only when lengths line up)
        if path and len(path_edges) == len(path) - 1:
            for j in range(len(path) - 1):
                a, b = path[j], path[j + 1]
                slot = path_edges[j]
                gap_adjacent = _is_gap_ref(a) or _is_gap_ref(b)
                if gap_adjacent:
                    if slot is not None:
                        c.add("route_gap_adjacent_not_null", f"{where}.path_edge_ids[{j}]",
                              f"path edge adjacent to a gap must be null (between {a!r} and {b!r})")
                    continue
                if slot is None:
                    c.add("route_missing_path_edge", f"{where}.path_edge_ids[{j}]",
                          f"non-gap-adjacent path edge is null (between {a!r} and {b!r})")
                    continue
                edge = edges_by_id.get(slot)
                if edge is None:
                    continue  # unresolved_ref already reported
                if edge.get("from") != a or edge.get("to") != b:
                    c.add("route_edge_endpoint_mismatch", f"{where}.path_edge_ids[{j}]",
                          f"edge {slot} endpoints ({edge.get('from')}->{edge.get('to')}) "
                          f"do not match path adjacency ({a}->{b})")

        # branch edges: only from a declared additional-input/configuration into
        # a Procedure that appears on the path.
        declared = set(_as_list(route.get("additional_input_ids"))) | set(_as_list(route.get("configuration_ids")))
        path_procs = {t for t in path if view.node_kind(t) == "procedure"}
        for j, be in enumerate(_as_list(route.get("branch_edge_ids"))):
            edge = edges_by_id.get(be) if isinstance(be, str) else None
            if edge is None:
                continue  # unresolved_ref already reported
            src, dst = edge.get("from"), edge.get("to")
            if src not in declared:
                c.add("route_branch_edge_illegal", f"{where}.branch_edge_ids[{j}]",
                      f"branch edge {be} originates at {src!r}, not a declared additional-input/configuration")
            elif dst not in path_procs:
                c.add("route_branch_edge_illegal", f"{where}.branch_edge_ids[{j}]",
                      f"branch edge {be} targets {dst!r}, not a Procedure on the route path")

        # gaps in path are declared in gap_ids
        for token in path:
            if _is_gap_ref(token) and token not in set(_as_list(route.get("gap_ids"))):
                c.add("route_path_gap_undeclared", f"{where}.gap_ids",
                      f"gap {token} appears in path but is not listed in gap_ids")


# --- contribution groups ------------------------------------------------------


def _check_contribution_groups(view: GraphView, c: IssueCollector) -> None:
    for i, cg in enumerate(view.contribution_groups):
        members = _as_list(cg.get("member_node_ids"))
        headline = _as_list(cg.get("headline_claim_ids"))
        if not members and not headline:
            c.add("contribution_group_empty", f"contribution_groups[{i}]",
                  f"contribution group {cg.get('id')} must contain at least one member node or headline claim")


def _check_claims_grouped(view: GraphView, c: IssueCollector) -> None:
    """Every Claim must be a headline claim of at least one contribution group.

    Claims in this contract are headline-layer objects. A Claim that is not
    listed in any ``contribution_group.headline_claim_ids`` is unreachable in the
    first-layer presentation (the viewer can only reach a Claim through a group),
    so it silently disappears — including unsupported Claims, which should instead
    surface as "Claim + Gap". This is a display-contract error, not a schema one.
    """
    grouped: set[str] = set()
    for cg in view.contribution_groups:
        for cid in _as_list(cg.get("headline_claim_ids")):
            if isinstance(cid, str):
                grouped.add(cid)
    for i, node in enumerate(view.nodes):
        if node.get("kind") != "claim":
            continue
        nid = node.get("id")
        if isinstance(nid, str) and nid not in grouped:
            c.add("ungrouped_headline_claim", f"nodes[{i}].id",
                  f"claim {nid} is not a headline claim of any contribution group; "
                  f"ungrouped claims are unreachable in the first-layer view",
                  layer="structural")


# --- coverage reconciliation --------------------------------------------------


def _check_coverage(view: GraphView, coverage: Any, c: IssueCollector) -> None:
    if coverage is None:
        return
    cov = _as_dict(coverage)
    regions = [_as_dict(r) for r in _as_list(cov.get("result_regions"))]

    # 1. coverage-plan internal count consistency
    for i, region in enumerate(regions):
        labels = _as_list(region.get("unit_labels"))
        expected = region.get("expected_unit_count")
        if region.get("count_matches_unit_labels") is True:
            if not isinstance(expected, int) or expected != len(labels):
                c.add("coverage_count_mismatch", f"result_regions[{i}]",
                      f"region {region.get('locator')!r} claims count_matches_unit_labels but "
                      f"expected_unit_count={expected} != len(unit_labels)={len(labels)}", layer="coverage")

    cov_by_locator = {
        region.get("locator"): region
        for region in regions
        if isinstance(region.get("locator"), str)
    }

    # 2. graph included_full regions reconcile against the frozen plan
    for i, reg in enumerate(view.result_region_scan):
        if reg.get("decision") != "included_full":
            continue
        where = f"result_region_scan[{i}]"
        locator = reg.get("region")
        planned = _as_list(reg.get("planned_unit_labels"))
        extracted = _as_list(reg.get("extracted_result_ids"))
        missing = _as_list(reg.get("missing_planned_units"))
        unexpected = _as_list(reg.get("unexpected_units"))

        if missing:
            c.add("included_full_has_missing_units", f"{where}.missing_planned_units",
                  f"included_full region {locator!r} has missing planned units: {missing}", layer="coverage")
        if unexpected:
            c.add("included_full_has_unexpected_units", f"{where}.unexpected_units",
                  f"included_full region {locator!r} has unexpected units: {unexpected}", layer="coverage")

        plan_region = cov_by_locator.get(locator)
        if plan_region is None:
            c.add("coverage_missing_row", f"{where}.region",
                  f"included_full region {locator!r} has no matching row in the coverage plan", layer="coverage")
            continue
        plan_labels = _as_list(plan_region.get("unit_labels"))
        if not plan_labels:
            c.add("coverage_missing_row", f"{where}.region",
                  f"coverage plan did not enumerate units for included_full region {locator!r}", layer="coverage")
        elif plan_labels != planned:
            c.add("coverage_row_label_mismatch", f"{where}.planned_unit_labels",
                  f"included_full region {locator!r} planned_unit_labels do not match the coverage plan", layer="coverage")
        if len(extracted) != len(planned):
            c.add("included_full_count_mismatch", f"{where}.extracted_result_ids",
                  f"included_full region {locator!r} extracted {len(extracted)} results for "
                  f"{len(planned)} planned units", layer="coverage")


# --- orchestration ------------------------------------------------------------


def validate(graph: Any, coverage: Any = None, source: Source | None = None) -> LintReport:
    """Validate a graph.json document, reporting every error in one pass.

    ``coverage`` is the coverage-plan.json document (or ``None`` to skip the
    coverage reconciliation checks); ``source`` is a :class:`Source` over the
    authoritative normalized paper (or ``None`` to skip the quote / span checks).
    Inputs are never mutated. Returns a :class:`LintReport`.
    """
    c = IssueCollector()

    _check_graph_schema(graph, c)
    if coverage is not None:
        _check_coverage_schema(coverage, c)

    view = GraphView(graph)

    _check_global_id_uniqueness(view, c)
    _check_references(view, c)
    _check_evidence_source(view, source, c)
    _check_node_reserved_fields(view, c)
    _check_source_path_privacy(view, c)
    _check_measurement_raw_text_grounded(view, c)
    _check_locator_quote_number_match(view, c)
    _check_measurement_ownership(view, c)
    _check_routes(view, c)
    _check_contribution_groups(view, c)
    _check_claims_grouped(view, c)
    _check_coverage(view, coverage, c)

    return c.report()
