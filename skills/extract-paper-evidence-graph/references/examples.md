# Synthetic Examples

These examples are invented. They demonstrate graph judgment, not facts about
any target paper.

## Contents

1. Synthetic paper fragment
2. Result granularity
3. Explicit and reconstructed relations
4. Multi-input provenance
5. Residual Gap
6. Claim support
7. Structural contribution
8. Anti-examples

## 1. Synthetic Paper Fragment

Assume a paper contains:

**Abstract**

> We introduce Sensor-500, a benchmark for industrial anomaly detection. Our
> Fusion model improves held-out accuracy over the convolutional baseline.

**Methods**

> Sensor-500 contains 500 labeled machine traces. Fusion encodes each trace and
> emits one of four anomaly labels. The Fusion-L configuration adds a retrieved
> maintenance-log summary to the encoder input.

**Evaluation**

> Predictions are compared with held-out technician labels. We report
> macro-F1 and accuracy. Separately, three blinded engineers compare the
> usefulness of generated diagnostic notes; pairwise outcomes are aggregated
> with a Bradley-Terry model.

**Table 2**

| System | Macro-F1 | Accuracy | Utility |
|---|---:|---:|---:|
| Conv baseline | 58.0 | 61.2 | 0.41 |
| Fusion | 69.1 | 72.6 | 0.58 |
| Fusion-L | 71.4 | 74.8 | 0.67 |
| Fusion-L (best-5 sensors) | 73.0 | 76.1 | – |

The paper never defines how the “best-5 sensors” were chosen.

## 2. Result Granularity

Correct: four Result nodes, one per row. Each has three Measurements.

```json
{
  "id": "res_t2_fusion_l",
  "kind": "result",
  "label": "Fusion-L on Sensor-500 held-out set",
  "system_or_condition": "Fusion-L",
  "paper_locator": "Table 2",
  "evidence_ids": ["ev_t2_header", "ev_t2_row03"],
  "measurements": [
    {
      "id": "res_t2_fusion_l__held_out__macro_f1",
      "metric": "macro-F1",
      "raw_text": "71.4",
      "numeric_value": 71.4,
      "unit": "%",
      "qualifier": "held-out",
      "availability": "reported",
      "evidence_ids": ["ev_t2_header", "ev_t2_row03"]
    },
    {
      "id": "res_t2_fusion_l__held_out__accuracy",
      "metric": "accuracy",
      "raw_text": "74.8",
      "numeric_value": 74.8,
      "unit": "%",
      "qualifier": "held-out",
      "availability": "reported",
      "evidence_ids": ["ev_t2_header", "ev_t2_row03"]
    },
    {
      "id": "res_t2_fusion_l__diagnostic__utility",
      "metric": "utility",
      "raw_text": "0.67",
      "numeric_value": 0.67,
      "unit": null,
      "qualifier": "blinded engineer comparison",
      "availability": "reported",
      "evidence_ids": ["ev_t2_header", "ev_t2_row03"]
    }
  ]
}
```

Incorrect:

```json
{
  "id": "res_main_results",
  "label": "Fusion performs well",
  "measurements": []
}
```

Why: it loses conditions, comparators, exact values, and distinct evaluators.

Also incorrect: twelve Result nodes, one for each cell. The row is the
experimental unit; cells are Measurements.

## 3. Explicit and Reconstructed Relations

The Methods sentence directly states that Fusion emits anomaly labels:

```json
{
  "id": "edge_fusion_produces_predictions",
  "from": "proc_fusion_inference",
  "relation": "produces",
  "to": "art_fusion_predictions",
  "assertion_level": "explicit",
  "evidence_ids": ["ev_methods_fusion_outputs"],
  "rationale": "The paper directly states that Fusion emits one of four labels."
}
```

No single sentence says “Fusion predictions feed macro-F1 computation.”
Methods defines predictions, Evaluation defines the comparison, and Table 2
reports the row. Their compatible composition supports:

```json
{
  "id": "edge_fusion_predictions_feed_metrics",
  "from": "art_fusion_predictions",
  "relation": "feeds",
  "to": "proc_classification_metrics",
  "assertion_level": "reconstructed",
  "evidence_ids": [
    "ev_methods_fusion_outputs",
    "ev_evaluation_predictions_labels",
    "ev_t2_row03"
  ],
  "rationale": "Fusion emits anomaly-label predictions, and the evaluation compares system predictions with held-out labels for the reported metrics."
}
```

Do not call this explicit. Do not omit it merely because it spans sections.

## 4. Multi-Input Provenance

Accuracy and macro-F1 use predictions plus technician labels:

```json
{
  "id": "route_fusion_l_classification",
  "result_id": "res_t2_fusion_l",
  "subject_procedure_ids": ["proc_fusion_inference"],
  "subject_output_id": "art_fusion_predictions",
  "subject_variant": {
    "label": "Fusion-L",
    "condition_evidence_ids": ["ev_t2_row03"],
    "distinguishing_configuration_ids": ["cfg_fusion_l"]
  },
  "measurement_ids": [
    "res_t2_fusion_l__held_out__macro_f1",
    "res_t2_fusion_l__held_out__accuracy"
  ],
  "path": [
    "art_sensor_500",
    "proc_fusion_inference",
    "art_fusion_predictions",
    "proc_classification_metrics",
    "res_t2_fusion_l"
  ],
  "additional_input_ids": ["art_technician_labels"],
  "configuration_ids": ["cfg_fusion_l"],
  "gap_ids": [],
  "path_edge_ids": [
    "edge_dataset_feeds_fusion",
    "edge_fusion_produces_predictions",
    "edge_fusion_predictions_feed_metrics",
    "edge_metrics_produce_fusion_l_result"
  ],
  "branch_edge_ids": [
    "edge_labels_feed_metrics",
    "edge_fusion_l_configures_inference"
  ],
  "assertion_level": "reconstructed"
}
```

Wrong:

```text
Fusion predictions → technician labels → metrics
```

Predictions do not produce labels. They independently join the metric
computation.

The utility value needs a separate route:

```json
{
  "id": "route_fusion_l_utility",
  "result_id": "res_t2_fusion_l",
  "subject_procedure_ids": ["proc_fusion_inference"],
  "subject_output_id": "art_fusion_diagnostic_notes",
  "subject_variant": {
    "label": "Fusion-L",
    "condition_evidence_ids": ["ev_t2_row03"],
    "distinguishing_configuration_ids": ["cfg_fusion_l"]
  },
  "measurement_ids": ["res_t2_fusion_l__diagnostic__utility"],
  "path": [
    "art_sensor_500",
    "proc_fusion_inference",
    "art_fusion_diagnostic_notes",
    "proc_blinded_engineer_comparison",
    "art_pairwise_utility_outcomes",
    "proc_bradley_terry_aggregation",
    "res_t2_fusion_l"
  ],
  "additional_input_ids": [],
  "configuration_ids": ["cfg_fusion_l", "cfg_engineer_judging"],
  "gap_ids": [],
  "path_edge_ids": [
    "edge_dataset_feeds_fusion",
    "edge_fusion_produces_notes",
    "edge_notes_feed_engineer_comparison",
    "edge_comparison_produces_outcomes",
    "edge_outcomes_feed_bradley_terry",
    "edge_bradley_terry_produces_result"
  ],
  "branch_edge_ids": [
    "edge_fusion_l_configures_inference",
    "edge_judging_configures_comparison"
  ],
  "assertion_level": "reconstructed"
}
```

The same `art_fusion_predictions` and `art_fusion_diagnostic_notes` output
families may be reused by another Fusion configuration. Preserve that
condition in `subject_variant`; do not create `art_fusion_l_predictions`,
`art_fusion_x_predictions`, and similar per-row copies unless the paper treats
them as independently addressable outputs.

## 5. Residual Gap

The “best-5 sensors” label identifies a selected subgroup, but does not define
selection. Do not invent a ranking Procedure. Preserve the Result and insert:

```json
{
  "id": "gap_best_5_sensor_selection",
  "category": "missing_producer",
  "affects": ["res_t2_fusion_l_best_5"],
  "expected_kind": "procedure",
  "between": ["art_sensor_500", "proc_fusion_inference"],
  "missing_content": "The candidate population, ranking metric, and selection rule used to choose the five sensors.",
  "searched_locations": ["Methods", "Evaluation", "Table 2", "Appendix A"],
  "question": "How were the five sensors ranked and selected before Fusion-L inference?"
}
```

The broad route may still be reconstructed:

```text
Sensor-500 → [missing selection] → Fusion-L inference
→ predictions → classification metrics → 76.1
```

This is more informative than either:

- fabricating `proc_select_best_sensors`; or
- discarding the entire route as `missing_producer`.

Because selection happens before both classification and any diagnostic-note
evaluation, `gap_best_5_sensor_selection` must appear on every best-5 route,
not only one measurement family.

## 6. Claim Support

The abstract makes Fusion-L improvement salient. Table 2 provides focal and
comparator values. The support edge retains both:

```json
{
  "id": "edge_fusion_l_supports_accuracy_claim",
  "from": "res_t2_fusion_l",
  "relation": "supports",
  "to": "clm_fusion_improves_accuracy",
  "assertion_level": "explicit",
  "evidence_ids": ["ev_abstract_improvement", "ev_t2_header", "ev_t2_row01", "ev_t2_row03"],
  "rationale": "The headline comparison is directly stated and Table 2 supplies the focal and baseline accuracy values.",
  "comparison_result_ids": ["res_t2_conv_baseline"],
  "measurement_ids": [
    "res_t2_fusion_l__held_out__accuracy",
    "res_t2_conv_baseline__held_out__accuracy"
  ]
}
```

If the abstract instead claimed “diagnostic notes reveal root causes” but the
paper reported only usefulness preferences, the utility Result would be
adjacent, not direct support. Use an `unsupported_claim` Gap unless another
evaluation operationalizes root-cause accuracy.

Both Claims still belong in the empirical contribution's overview:

```json
{
  "id": "cg_sensor_500_empirical_study",
  "title": "Sensor-500 empirical study",
  "type": "empirical",
  "salience_evidence_ids": ["ev_abstract_improvement"],
  "member_node_ids": [],
  "headline_claim_ids": [
    "clm_fusion_improves_accuracy",
    "clm_diagnostic_notes_reveal_root_causes"
  ]
}
```

The second Claim retains its `unsupported_claim` Gap. Omitting it from
`headline_claim_ids` would hide a headline statement rather than represent its
missing support.

## 7. Structural Contribution

“We introduce Sensor-500” is structural:

```json
{
  "id": "cg_sensor_500_benchmark",
  "title": "Sensor-500 anomaly-detection benchmark",
  "type": "structural",
  "salience_evidence_ids": ["ev_abstract_sensor_500"],
  "member_node_ids": [
    "art_raw_machine_traces",
    "proc_sensor_500_curation",
    "art_sensor_500",
    "art_technician_labels"
  ],
  "headline_claim_ids": []
}
```

Do not create a Claim requiring a numerical Result to support the existence of
the benchmark.

## 8. Anti-Examples

### Invented bridge

```json
{
  "id": "proc_experimental_evaluation",
  "kind": "procedure",
  "label": "Experimental evaluation",
  "evidence_ids": ["ev_t2_row03"]
}
```

Reject it. A row proves a Result exists, not that this unnamed Procedure
exists. Use the grounded classification or utility procedures.

### Gap dumping

```json
{
  "id": "gap_fusion_l_producer",
  "category": "missing_producer",
  "affects": ["res_t2_fusion_l"],
  "missing_content": "The Result producer is not directly stated in one sentence."
}
```

Reject it. Methods, Evaluation, and Table 2 jointly support a reconstructed
route. Only the genuinely missing best-5 selection deserves a Gap.

### Claim washing

```json
{
  "from": "res_t2_fusion_l",
  "relation": "supports",
  "to": "clm_fusion_explains_root_causes"
}
```

Reject it. Accuracy and utility do not necessarily measure explanation
correctness.

### False explicit status

If a relation needs Methods plus Evaluation plus a table row, it is
`reconstructed` even when the composition is compelling.

### Truncated route

```json
{
  "path": [
    "art_fusion_predictions",
    "proc_classification_metrics",
    "res_t2_fusion_l"
  ]
}
```

Reject it. Predictions are a grounded intermediate, not a root source. Extend
the route through Sensor-500 and Fusion inference.

### Subject conflation

If a table also reports technician performance, do not route that Result
through `art_fusion_predictions` or `cfg_fusion_l`. Create a grounded
technician-label/review Artifact and the relevant human-cohort Gap or
Configuration. Sharing the classification Procedure does not make the subjects
identical.

### Self-defining operation label

If a row is named “Mean ensemble”, the name does not prove what values are
averaged, whether scores or labels are averaged, or how ties are handled.
Ground a concrete averaging Procedure or insert a Gap between component outputs
and metric computation.
