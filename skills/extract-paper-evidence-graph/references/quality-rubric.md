# Quality Rubric

## Contents

1. Review protocol
2. Source and coverage
3. Result granularity
4. Structural fidelity
5. Provenance quality
6. Epistemic honesty
7. Claim quality
8. Gap quality
9. Presentation readiness
10. Failure modes and corrective actions
11. Final report checklist

## 1. Review Protocol

Review the first complete draft in this order:

1. frozen coverage plan versus result-region scan;
2. every Result and Measurement;
3. every provenance route;
4. every reconstructed edge;
5. every Gap;
6. every headline Claim;
7. contribution groups and presentation readiness.

Record all findings before editing. Correct them in one pass. This prevents an
early local fix from hiding later global problems.

Use these verdicts for each check:

- `pass`
- `correct`
- `exclude_with_reason`
- `unresolved_source_limitation`

Do not use a numerical score to excuse a failed invariant.

## 2. Source and Coverage

### Checks

- The authoritative source path and representation are recorded.
- Every evidence quote comes from that source.
- Every frozen result region has a scan decision.
- Every tabular region's planned unit count equals its enumerated label count.
- Every `included_full` table has zero missing and unexpected unit labels.
- Every frozen headline obligation has a `headline_scan` disposition.
- Every transformation-bearing condition label has a grounded
  Procedure/Configuration or localized Gap disposition.
- Every table row, figure condition, subgroup, and ablation named in a primary
  result region is counted and accounted for.
- Derived plots are excluded only when their source results are retained.
- Later-discovered result regions are recorded rather than silently added to
  the frozen plan.
- Appendices defining metrics, prompts, configurations, or evaluators were
  inspected when relevant to routes.

### Failure signals

- Results come mostly from the abstract or first result table.
- A table is represented by one “main performance” Result.
- Figures or appendices disappear without an exclusion record.
- Evidence cites prior profiles, reviews, or outside descriptions.

## 3. Result Granularity

For each Result:

- It represents one system/condition unit.
- Its label preserves the printed condition.
- Its locator is precise.
- All printed measurements for that unit are represented.
- Metric, qualifier, unit, raw text, numeric value, uncertainty, and
  availability are not conflated.
- Dashes and missing cells are not converted to zero.
- Values appear in localized evidence.

### Count reconciliation

For each result region record:

```text
printed units:
extracted Results:
printed measurement cells:
reported Measurements:
not-reported/not-applicable cells:
unaccounted discrepancy:
```

Any unexplained discrepancy requires correction.

### Failure signals

- One Result contains multiple unrelated systems.
- One node exists per table cell.
- Only values mentioned in prose are extracted.
- Exact values are embedded in labels instead of Measurements.
- Qualifiers such as dataset split, task, subgroup, or metric family are lost.

## 4. Structural Fidelity

### Checks

- Source datasets and sampled/derived datasets are distinguished when the paper
  distinguishes them.
- Intermediate outputs exist when required to express the mechanism.
- Procedures are operational, not section headings.
- Configuration families retain named variants.
- Model outputs and metric Results are distinct.
- Reused entities have one canonical node rather than per-result duplicates.
- Result-condition identity is carried by `subject_variant`; output Artifacts
  are not duplicated merely to encode table-row labels.
- Human, model, single-system, ensemble, and aggregate outputs remain distinct
  when the paper distinguishes them.
- Structural contributions are contribution groups, not forced empirical
  Claims.

### Failure signals

- One generic method node covers ingestion, inference, aggregation, and
  evaluation.
- Persona/policy/condition variants are hidden in prose.
- Reports, predictions, judgments, or labels vanish between Procedures.
- A node was created only to give a disconnected Result a producer.
- Output Artifact count tracks Result count nearly one-for-one even though the
  paper describes a small number of reusable output families.

## 5. Provenance Quality

Inspect every reported Measurement.

### Required questions

1. Which route owns it?
2. What exact system/human/ensemble/aggregate subject does the route name?
3. Which subject Procedure, output family, and exact variant are recorded?
4. Which Procedure produces the numeric value?
5. What root source Artifact begins the path?
6. What independent inputs join the metric?
7. What Configurations define the condition?
8. What route-specific Gap remains?

### Route checks

- Every reported Measurement belongs to exactly one route.
- Every route records `subject_procedure_ids`, `subject_output_id`, and
  `subject_variant`.
- Subject output family, variant, and Configurations match the exact Result
  condition.
- Every route begins at a root source Artifact, not a measured intermediate.
- Measurement families with different evaluators have different routes.
- Additional inputs are branches, not false serial steps.
- `path_edge_ids.length == path.length - 1`.
- Every non-Gap path adjacency has exactly one matching positional edge.
- Every Gap adjacency has a positional `null`, so no edge bypasses the Gap.
- Every branch edge starts at a declared additional input/Configuration and
  ends at a Procedure in the path.
- The route's assertion level is no stronger than its weakest reconstructed
  segment.
- A residual Gap remains visible after broad reconstruction.

### Chain-thickness check

Do not optimize for a minimum edge count. Instead inspect the shape:

- If most Results terminate directly at one generic Procedure, the graph is too
  compressed.
- If most Results have only Gaps despite named Methods and evaluator sections,
  the graph is too conservative.
- If multiple Results reuse a well-grounded producer/evaluator family while
  retaining condition-specific routes and gaps, reuse is appropriate.

## 6. Epistemic Honesty

### Explicit edges

For every explicit edge, ask:

- Does one localized passage state both endpoint roles and their relation?
- Is the relation wording no stronger than the passage?

If not, downgrade to reconstructed or remove.

### Reconstructed edges

For every reconstructed edge, ask:

- Is each endpoint grounded?
- Do the cited passages describe the same experimental setup?
- Does the rationale explain composition rather than plausibility?
- Does the edge avoid introducing a new operation?
- Is any omitted selection/configuration still a Gap?

If not, replace with a Gap or remove.

### Absence discipline

- Gaps contain searched locations, not fabricated positive evidence.
- A missing detail is not silently filled from standard practice.
- Domain plausibility never upgrades a relation.

## 7. Claim Quality

For every Claim:

- Salience evidence comes from headline locations.
- `claim_form` and `salience_evidence_ids` are top-level Claim fields, not
  nested in `details`.
- The Claim is empirical/evaluative, not merely structural.
- Support edges have evidence distinct from salience when necessary.
- The supporting Measurements evaluate the property stated.
- Comparative Claims retain focal and comparator Results.
- A Claim without direct empirical support has an `unsupported_claim` Gap.
- Local observations are omitted or retained only as annotations/details, not
  promoted to headline Claims.

### Claim-washing test

Temporarily ignore the Claim text and inspect only its supporting Measurements.
Can a reader recover the direction and property of the Claim? If not, the
support is adjacent rather than adequate.

## 8. Gap Quality

For every Gap:

- It names one missing artifact, procedure, configuration, evaluator, mapping,
  or support relationship.
- `between` identifies its graph position when possible.
- `affects` lists all relevant nodes/routes without becoming global.
- The search record names inspected locations.
- The question is answerable by an author.
- The Gap does not duplicate another Gap.
- The Gap coexists with any broad route that is still defensible.
- The Gap appears on every downstream route affected by its position.
- Role-only evaluator descriptions become localized identity/configuration
  Gaps when the implementation cannot be rerun from the paper.

### Gap-to-route incidence

For each Gap list:

```text
Gap ID:
Graph position:
All downstream routes:
Routes containing the Gap:
Excluded routes and reason:
```

Any unexplained mismatch requires correction.

### Gap specificity test

Bad:

```text
The methodology is unclear.
```

Good:

```text
The paper reports a selected subgroup but does not state the candidate pool,
ranking metric, or threshold used before metric computation.
```

## 9. Presentation Readiness

The graph is ready for a generic Viewer when:

- labels are understandable without reading IDs;
- Results expose compact system/condition labels;
- Configurations expose named variants;
- routes can be laid out source-to-Result;
- additional inputs can be drawn as branches;
- Claims form a small rightmost headline layer;
- contribution groups can form the first overview layer;
- contribution groups are nonempty and structural groups contain grounded
  member nodes;
- every Claim is reachable from at least one contribution group through
  `headline_claim_ids`, including unsupported Claims;
- Gaps have a display label/question and expected position;
- explicit and reconstructed relations can use distinct line styles.

Do not alter semantics merely to simplify layout.

### Zero-degree audit (required before finalization)

Before writing `extraction-report.md`, list every ordinary (non-Gap) node and
check it against every edge's `from`/`to`. A node with zero edges is an
accidental island unless one of the following applies, and the report must
say which:

- **Add the grounded edge.** If the paper's own text supports a `feeds`/
  `configures`/`produces`/etc. relation to some Procedure or Result the node
  is genuinely part of, add that edge with its own evidence — do not leave
  the node unconnected just because no earlier pass drew it in.
- **Group-only structural contribution.** If the node is a real structural
  contribution but has no operational input/output relation to any
  Procedure or Result (e.g. a purely theoretical derivation, a proof, a
  framework name with no traceable data flow), do not fabricate an edge to
  give it a producer or consumer it doesn't have. Represent it instead as a
  member of a `contribution_group` (its own group if no existing group fits)
  and record in the report *why* no edge applies.
- **Remove it.** If neither of the above holds — the node adds nothing
  reachable from any route or group — delete it rather than ship a floating
  node with no explanation.

A zero-degree node with no group membership and no stated reason is always a
defect, never a stylistic choice. Gap nodes are exempt from this specific
check (their connectivity is covered separately: a Gap must have either a
two-ended `between` or a non-empty `affects`, per the Gap Quality section).

## 10. Failure Modes and Corrective Actions

| Failure | Typical rationalization | Required correction |
|---|---|---|
| Generic bridge | “A producer is required, so this evaluation node is implied.” | Remove unnamed Procedure; use the actual metric Procedure or Gap. |
| Gap dumping | “No sentence directly states the whole path.” | Compose compatible passages into reconstructed edges; retain only localized residual Gaps. |
| Table compression | “The main finding is enough.” | Enumerate every required row/condition and exact measurement. |
| Cell explosion | “Maximum detail means one node per value.” | Group measurements under one system/condition Result. |
| Metric shortcut | “The model produced 82% accuracy.” | Insert system output and metric Procedure; the model produced predictions. |
| False linear join | “A route must be a single list.” | Put labels/judgments/reference data in additional inputs. |
| Claim washing | “This Result is related to the Claim.” | Require support-specific evidence and matching measurements, or Gap. |
| Salience confusion | “The abstract says it, so it is supported.” | Keep abstract span as salience; find Result support separately. |
| Hidden configuration | “Variants fit in the Procedure description.” | Create a Configuration family with structured variants. |
| Truncated route | “The measured output is already a grounded starting point.” | Extend to a root source or insert an upstream-lineage Gap. |
| Subject conflation | “All rows use the same evaluator, so they can share one output Artifact.” | Model exact human/model/ensemble outputs and Configurations separately. |
| Artifact explosion | “Every exact Result needs its own exact output Artifact.” | Reuse a grounded output family and preserve row identity in `subject_variant`; split only different origins/data kinds. |
| Route edge laundering | “This upstream edge is broadly related to the experiment.” | Keep only edges matching route adjacencies or declared branches; a Gap remains an interruption. |
| Wrong frozen count | “The table looks like twelve rows.” | Freeze exact unit labels and reconcile list length to count before graph construction. |
| Role-as-identity | “A held-out model is an evaluator identity.” | Resolve model/version or cohort selection, otherwise retain a localized evaluator Gap. |
| Local claim promotion | “The Results section emphasizes it.” | Require salience in a headline location; otherwise keep it as a local annotation. |
| Empty contribution group | “The abstract calls it a contribution.” | Require a grounded member node or Claim; otherwise use a headline annotation/exclusion. |
| Hidden headline Claim | “Only supported Claims belong in the overview.” | Put every Claim in at least one group's `headline_claim_ids`; retain any `unsupported_claim` Gap. |
| Self-defining label | “Average/selected/ensemble is obvious from the row name.” | Ground the transformation or create a localized Gap. |
| Partial Gap propagation | “The Gap appears on one route, so the Result is covered.” | Add it to every downstream affected route. |
| Silent headline omission | “The strongest Claims are enough.” | Dispose every frozen salient statement in `headline_scan`. |
| Gap erasure | “The broad route is reconstructed, so it is complete.” | Retain unresolved selection, mapping, or parameters as residual Gaps. |
| Whole-page citation | “The relevant sentence is somewhere on the page.” | Use localized sentences, rows, headers, or adjacent spans. |
| Outside completion | “The standard method probably uses this setting.” | Remove external assumption; record an underspecified configuration Gap. |

## 11. Final Report Checklist

`extraction-report.md` includes:

### Source

- authoritative representation;
- source hash when available;
- page/span fidelity limitations.

### Coverage

- result regions included;
- regions excluded and reasons;
- printed versus extracted Result and Measurement counts;
- later discoveries.
- headline obligations by disposition.
- condition-label audit obligations by grounded or Gap disposition.

### Graph shape

- nodes by kind;
- edges by relation and assertion level;
- provenance routes;
- routes beginning at root sources and routes with source limitations;
- contribution groups;
- Gaps by category;
- zero-degree audit result: every ordinary node accounted for as
  grounded-edge, group-only-structural (name the group), or removed — list
  any group-only nodes and the one-line reason no edge applies.

### Review

- review passes used;
- material corrections made;
- remaining unresolved coverage or source limitations;
- any new edge relation introduced beyond the core vocabulary.

### Completion statement

State one:

- complete under the authoritative paper source;
- complete with named source limitations;
- incomplete because a required source region was unreadable.

Never state that the graph is semantically proven correct.
