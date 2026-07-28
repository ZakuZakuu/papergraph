# Extraction Method

## Contents

1. Mental model
2. Source orientation
3. Coverage planning and dynamic anchors
4. Independent inventories
5. Result granularity
6. Structural extraction
7. Headline claims
8. Relation reconstruction
9. Provenance routes
10. Gap discovery
11. Evidence selection
12. Self-review and correction
13. Long-paper execution tactics

## 1. Mental Model

The target is not a summary diagram. It is a set of inspectable routes from
source artifacts through concrete operations and configurations to reported
measurements, then to a small number of headline empirical Claims.

Think in two complementary directions:

- **forward mechanism:** artifacts → procedures/configurations → outputs;
- **backward accountability:** exact Result → evaluator → system output →
  producer → source.

Use the forward view to understand the paper. Use the backward view to prevent
coarse or decorative edges.

The model is allowed to reason. The graph records whether that reasoning is
directly stated, reconstructed from multiple passages, or blocked by missing
information.

## 2. Source Orientation

Do not start by creating nodes from the abstract. First map the document.

Read in this order:

1. title and abstract;
2. contribution statements and introduction summary;
3. method overview or architecture figure;
4. dataset and experimental setup;
5. result-section headings;
6. every table and figure caption;
7. discussion, limitations, and conclusion;
8. appendices containing prompts, hyperparameters, metrics, or protocols.

Maintain a scratch map:

| Question | Record |
|---|---|
| What is newly built? | candidate artifacts/procedures/configurations |
| What is empirically asserted? | candidate headline Claims |
| Where are exact values? | result regions |
| What creates system outputs? | producer families |
| What turns outputs into numbers? | evaluator/metric families |
| What labels imply hidden operations? | gap candidates |

Do not commit graph IDs during orientation.

## 3. Coverage Planning and Dynamic Anchors

### Purpose

Dynamic anchors allocate attention before extraction. They are not withheld
answers and do not predict the final graph.

### Coverage-plan shape

```json
{
  "format_version": "paper-evidence-coverage/0.1",
  "paper_id": "paper-local-id",
  "frozen_before_graph": true,
  "headline_locations": [],
  "headline_obligations": [],
  "result_regions": [],
  "condition_label_audit": [],
  "structure_candidates": [],
  "configuration_families": [],
  "route_obligations": [],
  "ambiguity_probes": [],
  "later_discoveries": []
}
```

### Result-region anchors

Create one entry for every:

- table containing reported outcomes;
- figure containing primary values not duplicated in a table;
- paragraph that emphasizes a numerical result absent from tables;
- ablation or subgroup result region;
- appendix result table used by a headline Claim.

For each region record:

```json
{
  "locator": "Table 4",
  "source_span_ids": ["p8-table04"],
  "expected_unit_count": 2,
  "unit_labels": ["Baseline A", "Method B"],
  "count_matches_unit_labels": true,
  "must_capture": ["row labels", "all printed metrics", "qualifiers"],
  "derived_regions": ["Figure 5"]
}
```

For every table, `source_span_ids`, `expected_unit_count`, `unit_labels`, and
`count_matches_unit_labels` are required. A count without the label inventory
is invalid. Read from the header through the next caption/section boundary,
including continuation spans and wrapped final rows. Confirm:

```text
expected_unit_count == unit_labels.length
```

If layout prevents enumeration, set the count to `null`, list unresolved
candidates, and mark the region unresolved. Do not guess a count or later call
the table `included_full`. This is coverage planning, not Result construction.

### Condition-label audit

Create one disposition obligation for every label that implies an operation:

- selection or ranking (`best`, `top`, selected subgroup);
- averaging, voting, aggregation, or ensemble membership;
- filtering, calibration, or thresholding;
- train/test construction;
- human/expert cohort construction.

```json
{
  "label": "Mean ensemble",
  "implied_operation": "aggregation",
  "question": "Where is the mean defined, and what outputs are averaged?",
  "required_disposition": "grounded procedure/configuration or localized gap"
}
```

Do not assume a familiar label is self-defining.

### Headline obligations

Split headline locations into addressable statements. Give each a stable
obligation ID and require one final disposition in `headline_scan`. This
prevents a model from finding salient passages and then retaining only the
easiest Claims.

Only title/abstract, explicit contribution lists, introduction summaries, and
conclusions establish headline salience. Result-section statements belong in
support evidence or local annotations unless a headline location also states
the same contribution.

### Route anchors

Create obligations phrased as questions:

```json
{
  "target": "the primary ensemble result",
  "question": "Can its prediction producer, measurement procedure, source data, and configuration be traced, or does a localized gap remain?"
}
```

Do not write the expected answer.

### Ambiguity probes

Labels often hide operations. Search explicitly for definitions of:

- selected/best/top-k subsets;
- averages and voting rules;
- ensemble membership;
- filtering or exclusion;
- calibration;
- train/dev/test construction;
- judge identity and blinding;
- seeds, sampling, or decoding;
- human cohort construction;
- metric aggregation and tie handling.

Add one probe per paper-specific label. A probe may resolve cleanly and never
become a Gap.

For a human or model evaluator, “held-out model”, “LLM judge”, “expert”, or
another role label is not a rerunnable identity. Resolve the concrete
model/version or evaluator-cohort selection. If the paper omits it, retain the
broad evaluation route and add a localized `missing_evaluator` or
`underspecified_configuration` Gap.

### Freeze discipline

Write the coverage plan before graph construction. Do not delete obligations
that later prove inconvenient. Put newly discovered regions in
`later_discoveries`; this preserves the distinction between initial coverage
and correction.

## 4. Independent Inventories

Inventories prevent relationships from biasing entity selection.

### Inventory A: Results

Scan all frozen result regions and capture:

- system/condition label;
- table/figure/paragraph locator;
- all printed metric names and values;
- units and qualifiers;
- uncertainty;
- unavailable cells;
- exact evidence.

Do not ask how the Result was produced yet.

### Inventory B: Structure

Separately collect:

- source and intermediate Artifacts;
- concrete Procedures;
- Configuration families and named variants.

Do not create a Procedure merely because a Result lacks one.

Keep subject outputs separate when the paper distinguishes their origin:

- human reviews versus model-generated reviews;
- single-system predictions versus ensemble predictions;
- aggregate reports versus component reports;
- supervised-baseline predictions versus generative-system predictions.

Sharing an evaluator does not make its input Artifacts interchangeable.

### Inventory C: Headline contributions

Separately collect:

- structural contribution groups;
- empirical/evaluative headline Claims;
- salience evidence.

Do not attach Results yet.

Only after the three inventories are stable should linking begin.

## 5. Result Granularity

### Default unit

Use one Result per reported system/condition unit:

- one table row;
- one ablation condition;
- one subgroup;
- one named curve condition;
- one emphasized numerical outcome when no row exists.

Measurements are child records.

### Split a row when

- it combines two independently generated populations;
- measurement families refer to different experimental conditions despite a
  shared label;
- the paper explicitly treats parts as separate experiments.

### Keep a row grouped when

- columns are metrics for the same system and condition;
- binary and multiclass metrics evaluate the same output;
- uncertainty accompanies the same measurement.

Different measurement pipelines do not require splitting the Result. Use
separate provenance routes for the measurement families.

### Figures

When a figure reproduces a retained table, mark it
`excluded_as_derived`. When a figure contains unique values, extract each
addressable condition. If exact values cannot be read, preserve the reported
qualitative Result only when it supports a headline Claim, and record the
precision limitation.

### Completeness check

After each result region:

1. count printed units;
2. count extracted Results;
3. account for every discrepancy;
4. count expected versus captured measurements;
5. preserve dashes as `not_reported`, not as zero.
6. reconcile every transformation-bearing row label with the frozen
   condition-label audit.

## 6. Structural Extraction

### Artifact test

Create an Artifact when the item can be consumed, transformed, compared,
stored, or emitted:

- dataset or cohort;
- raw document/input;
- labels or decisions;
- generated predictions/reports;
- intermediate summaries;
- judgments or pairwise outcomes.

### Procedure test

Create a Procedure when the paper describes an operation with inputs and an
effect:

- curation or sampling;
- retrieval or summarization;
- model training or inference;
- voting or aggregation;
- evaluation or metric computation;
- human/LLM judging.

A section heading is insufficient. The Procedure must have operational
content.

### Configuration test

Create a Configuration when a setting changes how a Procedure runs or defines
an experimental condition. Group related variants under one node when the
paper presents them as a family.

### Preserve intermediate outputs

Do not jump directly from a system Procedure to a metric Result when the paper
describes an intermediate output. Examples:

```text
training → predictions → metric computation → accuracy
generation → reports → pairwise judging → outcomes → rating aggregation → rating
```

This distinction is essential for tracing the actual measurement mechanism.

### Reuse output families without losing condition identity

Create one canonical Artifact for a paper-described output family and preserve
the exact row condition in the route's `subject_variant`.

Appropriate reuse:

```text
reviewer inference → reviewer reports
  variant: strict policy
  variant: balanced policy
  variant: exploratory policy
```

Do not create three report Artifacts solely because three Result rows exist.
Create separate output families when the origin or data kind changes:

- human reviews versus model-generated reports;
- individual-system outputs versus second-stage aggregate/ensemble outputs;
- predictions or recommendations versus generated text;
- supervised-baseline predictions versus agent outputs.

A family Artifact does not erase an unresolved operation. Selection, voting,
averaging, or aggregation that is not described remains a Gap in the affected
route.

## 7. Headline Claims

### Salience rule

A Claim belongs in the headline layer when its importance is grounded in at
least one of:

- abstract;
- explicit contribution list;
- introduction summary;
- conclusion.

Prefer two locations when available. A result-discussion sentence alone is a
local observation and cannot create a headline Claim.

### Empirical-only Claim nodes

Claim nodes are empirical or evaluative:

- a method outperforms a comparator;
- performance approaches a reference;
- a condition improves or harms an outcome;
- a measured association exists;
- a reported evaluation supports an interpretive conclusion.

Structural contributions are contribution groups. Split mixed sentences:

```text
"We introduce X and show that X improves Y"
```

into:

- structural group for X;
- empirical Claim for improvement in Y.

### Link last

Do not require every Claim to have support while selecting it. After Results
exist:

1. identify focal Result measurements;
2. preserve comparator Results for comparative Claims;
3. add a support edge with support-specific evidence;
4. otherwise create `unsupported_claim`.

Salience evidence cannot discharge support.

### Assign every Claim to the overview layer

After support edges and `unsupported_claim` Gaps are settled, assign every
Claim to at least one contribution group through `headline_claim_ids`.
Assignment records which core contribution the Claim belongs to; it does not
assert that the Claim is supported. Therefore supported and unsupported Claims
may appear in the same group, with the latter retaining their Gaps.

Keep structural nodes in `member_node_ids` and Claims in
`headline_claim_ids`. Membership may overlap across groups. Before finalizing,
compute:

```text
all Claim IDs - union(all contribution_group.headline_claim_ids)
```

The result must be empty.

### Dispose every headline obligation

After Claims and contribution groups exist, populate `headline_scan`. Every
frozen obligation becomes one of:

- structural contribution;
- empirical Claim;
- merged duplicate;
- local annotation;
- excluded with reason.

No obligation disappears silently.

## 8. Relation Reconstruction

### Decision table

| Evidence state | Action |
|---|---|
| One localized passage directly states endpoints and relation | explicit edge |
| Compatible passages establish endpoint roles and mechanism | reconstructed edge |
| Broad mechanism is supported but a selection/configuration is absent | reconstructed edge plus residual Gap |
| Only a label suggests an operation | Gap; do not create the Procedure |
| Endpoints are plausible only from domain knowledge | no edge; optionally Gap |
| Paper contradicts the proposed connection | no edge; report ambiguity |

### Reconstructed edge threshold

A reconstructed edge is justified when all are true:

1. both endpoints are grounded;
2. passages describe compatible stages of the same reported setup;
3. the connection does not introduce a new unnamed mechanism;
4. the rationale can state exactly how the passages compose;
5. omitted details remain visible as Gaps.

A single table row may identify a Result but does not, by itself, establish an
aggregation, selection, or training Procedure.

### Avoid bridge invention

Reject nodes whose only purpose is to make disconnected Results look complete:

- generic experiment;
- evaluation pipeline with no operational definition;
- result generation;
- performance analysis;
- unspecified aggregation inferred only from a row label.

Use the paper's actual metric Procedure or a localized Gap.

### Avoid gap dumping

Do not demand one sentence that states an entire route. Papers often define:

- model inputs in Methods;
- system outputs in a prompt or appendix;
- evaluation metrics in Experimental Setup;
- exact values in a table.

When these passages are compatible, compose them into a reconstructed route.
The status communicates the reasoning.

## 9. Provenance Routes

### Separate system production from measurement

For every Result distinguish:

```text
source → system procedure → system output
system output + reference input → measurement procedure → exact number
```

The system does not directly produce accuracy, F1, error rate, rating, or
significance unless the paper defines that value as its output.

### Identify the route subject

Before assembling a route, write:

```text
Result subject:
Subject procedure(s):
Subject output family:
Subject variant:
Root source artifact:
```

The output family must match the subject's origin and data kind. The
`subject_variant` must match the exact row/condition and cite its condition
evidence. Do not use an AI output Artifact for a human baseline or an
individual output Artifact for an ensemble unless the paper explicitly treats
them as the same collection.

Write these identities into `subject_procedure_ids`, `subject_output_id`, and
`subject_variant`.

### Multiple measurement families

Split routes when columns depend on different evaluators:

```text
predictions + labels → classification metrics → precision/recall/F1
generated text → pairwise judge → outcomes → rating aggregation → rating
```

Both routes may terminate at one Result.

### Multi-input joins

Use:

- `path` for the primary output flow;
- `additional_input_ids` for labels, reference answers, judges' comparisons, or
  other independent inputs;
- `configuration_ids` for control branches.

Never write:

```text
predictions → official labels → metric
```

when predictions and labels independently feed the metric.

### Route-specific gaps

Place a Gap where the missing operation belongs:

```text
candidate cohort → [missing selection procedure] → selected cohort → metric
```

If no selected-cohort Artifact can be grounded, the Gap may sit directly
between the candidate cohort and metric. State the expected kind and author
question.

### Route completion

For every reported Measurement:

1. assign exactly one route;
2. verify the final producer is the measurement Procedure;
3. extend the route to a root source Artifact;
4. preserve all configurations affecting that condition;
5. retain any residual Gap.

If the source-to-subject lineage cannot be established, put a Gap in that
position. Do not shorten the route to begin at the subject output.

### Route-edge consistency

After assembling each route:

1. enumerate every adjacent pair in `path`;
2. write one positionally aligned `path_edge_ids` entry per pair;
3. use `null` for every pair containing a Gap;
4. otherwise require exactly one matching edge;
5. put additional-input and Configuration edges in `branch_edge_ids`;
6. reject every branch edge whose source is undeclared or whose target
   Procedure is absent from `path`.

Never borrow an upstream edge from a different subject family to make a route
look connected across a Gap.

## 10. Gap Discovery

Gap discovery is an active absence search, not a byproduct of failed linking.

For every Result ask:

- Is the system/condition mapping explicit?
- Is subgroup selection defined?
- Is ensemble membership defined?
- Is aggregation defined?
- Is the evaluator identity and protocol defined?
- Are metric inputs identifiable?
- Are model/inference parameters sufficient to rerun?

For every structural Procedure ask:

- Are all required inputs named?
- Are material settings reported?
- Is the output form described?

For every Claim ask:

- Is there a reported Result that evaluates the stated property?
- Does the Result measure the Claim, or only something adjacent?

Write specific author-facing questions. “More details are needed” is not a
usable Gap.

### Propagate gaps downstream

After routes exist, create a Gap-to-route incidence table. For each Gap:

1. locate its `between` position;
2. identify every route that passes downstream of that position;
3. include the Gap ID on each affected route;
4. exclude a route only with a reason.

A subgroup-selection Gap upstream of both accuracy and quality evaluation
belongs on both routes.

## 11. Evidence Selection

### Locality

Use the smallest span that preserves meaning:

- one sentence for a direct relation;
- two or more separate sentences for reconstruction;
- table row plus exact headers for a measurement;
- caption plus paragraph when a figure needs interpretation.

### Role separation

Distinguish:

- identity evidence: what a node is;
- measurement evidence: exact printed value and metric;
- relation evidence: why endpoints connect;
- salience evidence: why a Claim/contribution is headline;
- support evidence: why Results support a Claim.

The same source span may serve several roles, but do not assume one role from
another.

### Layout artifacts

When stable span IDs exist, cite them. If PDF layout inserts whitespace or
line-wrap hyphenation, preserve unchanged words and punctuation and mark
`quote_fidelity: layout_normalized`. Do not repair substantive wording.

## 12. Self-Review and Correction

Use `quality-rubric.md` after the first graph draft.

The first review must inspect the whole graph, not only suspicious nodes.
Collect all findings before editing. Then make one correction pass.

Allowed correction actions:

- add a missed grounded node, measurement, edge, route, or Gap;
- split an over-broad node;
- merge duplicate nodes;
- downgrade explicit to reconstructed;
- replace an invented bridge with a Gap;
- replace excessive Gaps with evidence-backed reconstruction;
- correct evidence or values;
- remove unsupported content.

Never remove a Gap solely to improve completeness statistics.

The review explicitly checks:

- every path starts at a root source Artifact;
- every route's subject output matches its Result;
- human/model/ensemble outputs and Configurations are not cross-assigned;
- every condition-label obligation has a Procedure/Configuration or Gap;
- every Gap is propagated to all downstream affected routes;
- every headline obligation has a `headline_scan` disposition.

Use a second correction pass only if pass one creates or exposes a material
contradiction, broken reference, or newly visible omitted result region.

## 13. Long-Paper Execution Tactics

### Work region by region

For long papers:

1. build the coverage plan globally;
2. extract Results region by region;
3. normalize repeated structural entities globally;
4. build routes by producer/evaluator family;
5. connect Claims last.

### Reuse without collapsing

One Procedure may participate in many routes. Reuse the node and edge family,
but keep each Result's route and measurements independently addressable.

### Manage uncertainty explicitly

Do not postpone uncertainty in private notes. Encode it as reconstructed status,
a Gap, an extraction limitation, or an unresolved coverage item.

### Prefer complete primary regions

When context is constrained, fully extract primary result tables before adding
minor local observations. Never partially extract a table without recording
the unprocessed rows in the coverage plan and report.
