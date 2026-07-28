# Graph Contract

## Contents

1. Top-level document
2. Evidence spans
3. Nodes
4. Measurements
5. Edges
6. Gaps
7. Provenance routes
8. Contribution groups
9. Headline scan
10. Result-region scan
11. ID and consistency rules

## 1. Top-Level Document

`graph.json` has this shape:

```json
{
  "format_version": "paper-evidence-graph/0.2",
  "paper": {},
  "evidence_spans": [],
  "nodes": [],
  "edges": [],
  "gaps": [],
  "provenance_routes": [],
  "contribution_groups": [],
  "headline_scan": [],
  "result_region_scan": [],
  "extraction": {}
}
```

Required `paper` fields:

```json
{
  "paper_id": "stable-local-id",
  "title": "Paper title",
  "source_path": "input/paper.pdf",
  "source_type": "pdf",
  "sha256": "hex hash when tools permit",
  "authoritative_representation": "PDF pages"
}
```

Allowed `source_type` values:

- `normalized_json`
- `page_text`
- `pdf`
- `plain_text`

Required `extraction` fields:

```json
{
  "coverage_plan_path": "coverage-plan.json",
  "coverage_plan_frozen_before_graph": true,
  "review_passes": 1,
  "status": "complete",
  "limitations": []
}
```

Allowed `status` values:

- `complete`
- `complete_with_source_limitations`
- `incomplete_source_unreadable`

## 2. Evidence Spans

Evidence lives once at the top level. Nodes, measurements, edges, and Claims
reference it by ID.

```json
{
  "id": "ev_p07_table2_row04",
  "page": 7,
  "locator": "Table 2, row 4",
  "quote": "Method Delta 0.72 0.18 14.6",
  "source_span_ids": ["p7-t2-r04"],
  "quote_fidelity": "exact"
}
```

Required fields:

- `id`
- `locator`
- `quote`
- `quote_fidelity`

`page` is required when the source has pages. `source_span_ids` is required
when stable source spans exist.

Allowed `quote_fidelity` values:

- `exact`: byte-for-visible-text quotation from the authoritative source;
- `layout_normalized`: words and punctuation are unchanged, but line-wrap
  whitespace or layout hyphenation is normalized.

Rules:

- Prefer one sentence, one table row plus its headers, or a short adjacent span.
- Do not cite an entire page when a localized span exists.
- A table measurement normally references both the row and the relevant header.
- Evidence that a statement is salient is not automatically evidence that a
  Result supports it.
- Do not create an evidence span for information absent from the paper.

## 3. Nodes

All nodes share:

```json
{
  "id": "kind_semantic_slug",
  "kind": "artifact",
  "label": "Human-readable English label",
  "label_zh": "Optional translated label",
  "evidence_ids": ["ev_p03_s12"],
  "details": {}
}
```

Kind-specific required fields appear at the top level exactly as documented
below. Do not move `measurements`, `system_or_condition`, `paper_locator`,
`claim_form`, or `salience_evidence_ids` into `details`. `details` is only for
optional kind-specific annotations.

Allowed node kinds:

- `artifact`
- `procedure`
- `configuration`
- `result`
- `claim`

### Artifact

An input, dataset, manuscript, model output, report, judgment set, prediction
set, or intermediate material.

Examples of valid artifact distinctions:

- source dataset versus sampled dataset;
- manuscript versus generated report;
- system predictions versus official labels;
- pairwise judgments versus aggregated rating.

Do not make an abstract topic or paper section an Artifact.

### Procedure

An operation that transforms, selects, aggregates, trains, infers, evaluates,
or measures.

Use the most specific paper-named or paper-described operation available.
“Experiment”, “analysis”, and “evaluation” alone are not adequate procedure
labels unless the paper itself defines a concrete operation by that name.

### Configuration

A setting or controlled family of variants that changes a Procedure:

- model and decoding setup;
- prompt/persona/policy family;
- experimental condition;
- ensemble membership;
- training hyperparameters;
- evaluator protocol.

Preserve named variants in structured fields:

```json
{
  "id": "cfg_review_policy",
  "kind": "configuration",
  "label": "Review-policy variants",
  "evidence_ids": ["ev_p04_s09"],
  "details": {
    "variants": ["strict", "balanced", "exploratory"]
  }
}
```

Do not create one Configuration node per scalar unless the scalar needs an
independent route or Gap. Related settings may form one configuration family.

### Result

A Result is one reported system/condition unit, usually one table row, one
ablation condition, one curve/figure condition, or one emphasized numerical
outcome.

```json
{
  "id": "res_t2_method_delta",
  "kind": "result",
  "label": "Method Delta on held-out test set",
  "system_or_condition": "Method Delta",
  "paper_locator": "Table 2",
  "evidence_ids": ["ev_p07_table2_row04"],
  "measurements": []
}
```

A Result must not represent an entire table containing unrelated conditions.
Do not create one Result node per cell; measurements are children.

### Claim

A Claim is an empirical or evaluative headline statement whose importance is
grounded by abstract, contribution-list, introduction, or conclusion evidence.

```json
{
  "id": "clm_delta_improves_accuracy",
  "kind": "claim",
  "label": "Method Delta improves held-out accuracy over the baseline",
  "claim_form": "comparative",
  "salience_evidence_ids": ["ev_p01_s08", "ev_p12_s16"],
  "evidence_ids": []
}
```

Allowed `claim_form` values:

- `comparative`
- `absolute`
- `trend`
- `association`
- `interpretive`

`salience_evidence_ids` explain why the Claim belongs in the headline layer.
Result-to-Claim support is represented by edges.

At least one salience span must come from the abstract, explicit contribution
list, introduction summary, or conclusion. A Results-section passage may be
support evidence or a local annotation, but it cannot establish headline
status by itself.

Structural statements such as “we introduce a dataset” are not Claim nodes.
Represent the dataset and its construction as a contribution group. Split a
mixed statement into structural and empirical parts.

## 4. Measurements

Each Result contains one or more Measurements:

```json
{
  "id": "res_t2_method_delta__test__accuracy",
  "metric": "accuracy",
  "raw_text": "72.0",
  "numeric_value": 72.0,
  "unit": "%",
  "qualifier": "held-out test",
  "direction": "higher_is_better",
  "availability": "reported",
  "uncertainty": null,
  "evidence_ids": ["ev_p07_table2_header", "ev_p07_table2_row04"]
}
```

Required fields:

- `id`
- `metric`
- `raw_text`
- `numeric_value`
- `unit`
- `qualifier`
- `availability`
- `evidence_ids`

Allowed `availability` values:

- `reported`
- `not_reported`
- `not_applicable`

For dashes or blank cells, preserve `raw_text`, use `numeric_value: null`, and
set the correct non-reported availability. A missing table cell is not a Gap
unless the paper claims the value should exist or its absence blocks a route.

Keep uncertainty when printed:

```json
{
  "uncertainty": {
    "kind": "standard_deviation",
    "raw_text": "± 1.4",
    "numeric_value": 1.4
  }
}
```

Never silently convert an unknown unit into percent. Preserve raw text when
numeric parsing is uncertain.

## 5. Edges

Every edge is evidence-bearing:

```json
{
  "id": "edge_predictions_feed_metric",
  "from": "art_delta_predictions",
  "relation": "feeds",
  "to": "proc_accuracy_computation",
  "assertion_level": "reconstructed",
  "evidence_ids": ["ev_p06_s14", "ev_p07_table2_row04"],
  "rationale": "The method emits predictions and the reported metric compares predictions with held-out labels.",
  "measurement_ids": ["res_t2_method_delta__test__accuracy"]
}
```

Core relations and direction:

| Relation | From | To | Meaning |
|---|---|---|---|
| `feeds` | artifact | procedure | Artifact is an input to Procedure |
| `configures` | configuration | procedure | Configuration controls Procedure |
| `produces` | procedure | artifact/result | Procedure creates output or reported measurement |
| `supports` | result | claim | Result supplies empirical support |
| `derived_from` | artifact | artifact | First Artifact is derived from second |

Additional relations are allowed only when these cannot express the paper and
the new relation is defined in `extraction-report.md`.

Allowed `assertion_level` values:

- `explicit`
- `reconstructed`

Use `explicit` only when a localized passage states the relation. Use
`reconstructed` when multiple passages jointly establish compatible endpoints
and the connection is needed to express the described mechanism.

Every reconstructed edge requires:

- localized evidence for both endpoint roles;
- a one-sentence rationale;
- no contradiction with another paper passage;
- a residual Gap when configuration or selection remains unknown.

Support edges may include comparator Results:

```json
{
  "id": "edge_delta_supports_claim",
  "from": "res_t2_method_delta",
  "relation": "supports",
  "to": "clm_delta_improves_accuracy",
  "assertion_level": "explicit",
  "evidence_ids": ["ev_p09_s03"],
  "rationale": "The discussion explicitly compares Delta with the baseline.",
  "comparison_result_ids": ["res_t2_baseline_alpha"],
  "measurement_ids": [
    "res_t2_method_delta__test__accuracy",
    "res_t2_baseline_alpha__test__accuracy"
  ]
}
```

## 6. Gaps

A Gap is an addressable missing graph element:

```json
{
  "id": "gap_selected_subset_rule",
  "category": "missing_producer",
  "affects": ["res_t4_selected_subset"],
  "expected_kind": "procedure",
  "between": ["art_candidate_pool", "proc_metric_computation"],
  "missing_content": "The selection rule and ranking metric for the reported selected subset.",
  "searched_locations": ["Methods §4.2", "Table 4", "Appendix C"],
  "question": "How was the selected subset chosen before evaluation?"
}
```

Allowed categories:

- `missing_artifact`
- `missing_producer`
- `underspecified_configuration`
- `missing_evaluator`
- `unconnected_result`
- `unsupported_claim`
- `ambiguous_mapping`
- `other`

Rules:

- `affects` references nodes or routes.
- `between` identifies the intended position when known.
- `searched_locations` records a real absence search.
- `question` is phrased so an author could answer it.
- Do not attach positive evidence to a Gap. Evidence proves presence; a search
  record documents absence.
- Prefer one specific Gap over a broad “method unclear” Gap.
- A Gap may appear inside a provenance path as a dashed missing node.

## 7. Provenance Routes

Each reported measurement belongs to exactly one route:

```json
{
  "id": "route_delta_accuracy",
  "result_id": "res_t2_method_delta",
  "subject_procedure_ids": ["proc_delta_training"],
  "subject_output_id": "art_delta_predictions",
  "subject_variant": {
    "label": "Method Delta",
    "condition_evidence_ids": ["ev_p07_table2_row04"],
    "distinguishing_configuration_ids": ["cfg_delta_hyperparameters"]
  },
  "measurement_ids": ["res_t2_method_delta__test__accuracy"],
  "path": [
    "art_training_data",
    "proc_delta_training",
    "art_delta_predictions",
    "proc_accuracy_computation",
    "res_t2_method_delta"
  ],
  "additional_input_ids": ["art_test_labels"],
  "configuration_ids": ["cfg_delta_hyperparameters"],
  "gap_ids": [],
  "path_edge_ids": [
    "edge_data_feeds_training",
    "edge_training_produces_predictions",
    "edge_predictions_feed_metric",
    "edge_metric_produces_result"
  ],
  "branch_edge_ids": [
    "edge_test_labels_feed_metric",
    "edge_hyperparameters_configure_training"
  ],
  "assertion_level": "reconstructed"
}
```

Rules:

- `subject_procedure_ids` identify the exact system, human, ensemble, or
  aggregate operation whose output is evaluated. Use an empty list only when
  that operation is the missing element represented by a Gap.
- `subject_output_id` identifies the measured output Artifact or grounded
  output family. It must belong to the Result's origin, not merely to the same
  evaluator family. It may be `null` only when a Gap in `path` represents the
  missing subject-production/output position.
- `subject_variant` is required. Its `label` preserves the exact Result
  condition, `condition_evidence_ids` ground that identity, and
  `distinguishing_configuration_ids` list the Configurations that distinguish
  the variant. Use an empty configuration list when the condition is defined
  by a Procedure or localized Gap instead.
- Prefer one canonical output-family Artifact when multiple Results are
  variants of the same paper-described output collection. Do not create one
  Artifact per Result unless the paper treats those outputs as independently
  addressable or they have genuinely different origins or data kinds.
- `path` is the complete primary dataflow path, ordered from a root source
  Artifact to Result. A grounded intermediate is not an acceptable starting
  point.
- Independent joining inputs go in `additional_input_ids`.
- Configuration branches go in `configuration_ids`.
- Missing path positions use Gap IDs and are repeated in `gap_ids`.
- `path_edge_ids` has exactly `path.length - 1` entries and is positionally
  aligned with path adjacencies. Each entry is the one edge connecting that
  pair, or `null` when either endpoint is a Gap.
- `branch_edge_ids` contains only edges from a declared
  `additional_input_id`/`configuration_id` into a Procedure in `path`.
- A Gap interrupts adjacency. Its two neighboring `path_edge_ids` entries are
  `null`; do not add an edge that leaps across the Gap.
- The subject output appears in `path`, unless its production is the localized
  Gap.
- Human, model, ensemble, aggregate, and supervised-baseline origins use
  distinct output families whenever the paper distinguishes them. Prediction,
  recommendation, generated-text, judgment, and other materially different
  output kinds also remain distinct.
- `assertion_level` is the strongest honest description of the complete route;
  a route containing any reconstructed segment is reconstructed.
- Split routes when measurement families have different evaluators or source
  artifacts.
- Measurements with `availability != reported` do not require a route.

## 8. Contribution Groups

A contribution group is a first-layer presentation wrapper, not a node:

```json
{
  "id": "cg_delta_framework",
  "title": "Delta training framework",
  "type": "structural",
  "salience_evidence_ids": ["ev_p01_s05"],
  "member_node_ids": [
    "art_training_data",
    "proc_delta_training",
    "cfg_delta_hyperparameters"
  ],
  "headline_claim_ids": []
}
```

Allowed types:

- `structural`
- `empirical`
- `mixed`

Membership may overlap. Do not force a node into one contribution when it
honestly participates in several.

Every group must contain at least one `member_node_id` or
`headline_claim_id`. A structural group must contain at least one grounded
member node. If a salient structural statement has no graph representation,
dispose it as a `headline_scan` local annotation or exclusion with reason
rather than creating an empty group.

Every Claim must appear in at least one contribution group's
`headline_claim_ids`. Claim grouping is independent of support status: an
unsupported headline Claim remains grouped and retains its
`unsupported_claim` Gap. Claims belong in `headline_claim_ids`, not
`member_node_ids`.

## 9. Headline Scan

Every statement frozen as salient during coverage planning receives one final
disposition:

```json
{
  "obligation_id": "headline_abstract_03",
  "evidence_ids": ["ev_p01_s09"],
  "disposition": "empirical_claim",
  "target_ids": ["clm_delta_improves_accuracy"],
  "reason": "The abstract presents a measured comparative contribution."
}
```

Allowed dispositions:

- `structural_contribution`
- `empirical_claim`
- `merged_duplicate`
- `local_annotation`
- `excluded_with_reason`

Rules:

- `target_ids` references contribution groups, Claims, nodes, or annotations
  named in `details`.
- A merged duplicate references the canonical Claim/group.
- An exclusion has a substantive reason.
- Finding a salient passage and then silently omitting it is invalid.

## 10. Result-Region Scan

Record every table, result-bearing figure, and emphasized numerical result:

```json
{
  "region": "Figure 3",
  "decision": "excluded_as_derived",
  "reason": "The figure reproduces values already retained from Table 2.",
  "evidence_ids": ["ev_p08_fig3_caption"]
}
```

For a table marked `included_full`, also require:

```json
{
  "planned_unit_labels": ["Baseline A", "Method B"],
  "extracted_result_ids": ["res_t3_baseline_a", "res_t3_method_b"],
  "missing_planned_units": [],
  "unexpected_units": []
}
```

`included_full` is invalid when either discrepancy list is nonempty or when
the frozen coverage plan did not enumerate the table's units.

Allowed decisions:

- `included_full`
- `included_selected_conditions`
- `excluded_as_derived`
- `excluded_non_result`
- `unreadable`

An exclusion must have a reason. “Not important” is not sufficient.

## 11. ID and Consistency Rules

Prefixes:

- `art_` artifact
- `proc_` procedure
- `cfg_` configuration
- `res_` result
- `clm_` claim
- `edge_` edge
- `gap_` gap
- `route_` provenance route
- `ev_` evidence span
- `cg_` contribution group

IDs are lowercase ASCII snake case and stable within the paper.

Final consistency requirements:

- IDs are unique across each collection.
- Every reference resolves.
- Every reported Measurement appears in exactly one route.
- Every route begins at a root source Artifact and identifies the exact subject
  output family and condition variant.
- Every `path_edge_ids` list aligns positionally with its path, and every
  `branch_edge_id` belongs to a declared branch.
- Every contribution group is nonempty, and every structural group has a
  grounded member node.
- Every Claim appears in at least one contribution group's
  `headline_claim_ids`, including Claims with `unsupported_claim` Gaps.
- Every Result has at least one reported Measurement or an explicit reason.
- Every empirical Claim has a support edge or `unsupported_claim` Gap.
- Every Gap affects a real node or route.
- Every evidence ID resolves to one localized paper span.
- Every Result region is represented in `result_region_scan`.
- Every frozen headline obligation is represented in `headline_scan`.
- Every Gap appears on all downstream routes affected by its `between`
  position.
