---
name: extract-paper-evidence-graph
description: Use when a user asks to extract, map, trace, audit, or structure a research paper's datasets, methods, configurations, exact results, claims, provenance, evidence chains, or missing reproducibility links into JSON.
---

# Extract Paper Evidence Graph

## Core Principle

Build an inspectable evidence graph from the paper's own record. Preserve exact
reported results, reconstruct defensible multi-span connections, and expose
unresolved links as localized gaps. Do not optimize for a graph that merely
looks complete.

## Required References

Read these before extraction:

1. `references/graph-contract.md` for the output model.
2. `references/extraction-method.md` for the full extraction procedure.

Read `references/examples.md` before resolving an ambiguous edge, result
granularity, multi-input route, or gap. Read
`references/quality-rubric.md` before self-review.

## Accepted Inputs

Use the best paper representation available, in this order:

1. normalized JSON with pages and stable spans;
2. page-preserving text;
3. PDF;
4. plain text without pages.

Treat one representation as authoritative. Do not silently supplement it with
web searches, reviews, code, or prior extractions unless the user explicitly
requests outside-source analysis.

## Required Outputs

Write all three beside the requested output location:

- `coverage-plan.json`
- `graph.json`
- `extraction-report.md`

If no output location is given, create `paper-evidence-graph/` in the current
workspace. Do not substitute prose for these files.

## Non-Negotiable Invariants

- Evidence quotes are localized and attributable to the authoritative paper.
- Every tabular result region freezes its exact row/condition labels and
  reconciles their count before graph construction; a count without labels is
  not a coverage plan.
- A Result represents one reported system/condition row or equivalent
  experimental unit; measurements are structured children, not separate nodes.
- Enumerate Results, structural nodes, and Claims independently before linking.
- `explicit` means directly stated; `reconstructed` means jointly supported by
  multiple passages. Never relabel reconstruction as explicit.
- A missing selection, configuration, producer, evaluator, or support link is a
  first-class Gap.
- Reconstructed routes may retain residual Gaps.
- Do not invent generic procedures such as “experimental evaluation” to make a
  Result connected.
- Do not turn every uncertain connection into a Gap when named procedures and
  multiple passages support a reconstructed route.
- Metric values are produced by measurement/evaluation procedures, not directly
  by the system whose outputs are measured.
- Every provenance route begins at a root source Artifact. Do not truncate a
  route at a convenient intermediate output.
- Every route names the exact subject Procedure, output family, and condition
  variant being evaluated.
- Reuse a grounded output-family Artifact across variants of the same origin;
  do not create one Artifact per Result merely to preserve a row label.
- Keep genuinely different output origins and data kinds distinct, including
  human versus model, single-system versus aggregate, predictions versus
  generated text, and supervised-baseline outputs.
- Multi-input computations use a primary path plus additional inputs; never
  serialize independent inputs into a false causal chain.
- Every transformation-bearing condition label resolves to a grounded
  Procedure/Configuration or a localized Gap.
- Every evaluator has a rerunnable implementation identity or a localized Gap;
  a role label such as “held-out model” is not an implementation identity.
- Claims are empirical/evaluative headline statements with salience in the
  abstract, contribution list, introduction summary, or conclusion. Results
  text alone may support a Claim but cannot make it headline.
- Structural contributions belong in contribution groups.
- Every Claim belongs to at least one contribution group through
  `headline_claim_ids`. Group assignment is independent of support: a Claim
  with an `unsupported_claim` Gap remains visible in its contribution group.

## Workflow

### 1. Orient Without Building the Graph

Read the title, abstract, contribution statements, method overview, result
section, all table/figure captions, limitations, and conclusion. Locate every
primary result region and all named system/configuration families.

### 2. Freeze the Coverage Plan

Before creating graph nodes, write `coverage-plan.json`. Include:

- headline-contribution locations;
- one obligation per salient statement, requiring a final disposition;
- every primary result region and its row/condition obligations;
- for every table, the exact ordered unit labels, source spans, and a declared
  count that equals the label-list length;
- every result label implying selection, averaging, voting, aggregation,
  filtering, ranking, calibration, or another hidden operation;
- structural contribution candidates;
- configuration families;
- suspicious labels that imply hidden operations, such as selected, best,
  top-k, average, ensemble, filtered, or held-out;
- paper-specific route questions that must end in a supported path or Gap.

Set `frozen_before_graph: true`. The plan is an attention contract, not an
answer key. Do not revise it to match the completed graph; record later
discoveries separately.

### 3. Build Independent Inventories

Create provisional inventories in this order:

1. all exact Results from every primary result region;
2. artifacts, procedures, and configurations;
3. empirical headline Claims and structural contribution groups.

Do not add edges during this step.

### 4. Construct Result-First Provenance

For each Result, ask:

1. What output was measured?
2. Which paper-named procedure produced that output?
3. Which evaluator or metric procedure produced each number?
4. What labels, references, judges, or comparison inputs joined the
   computation?
5. Which configurations materially define the condition?
6. Which necessary link remains unstated?

Record `subject_procedure_ids`, `subject_output_id`, and `subject_variant`.
Extend the primary path upstream to a root source Artifact. If upstream lineage
cannot be established, insert a Gap or record a source limitation; do not start
at the measured output.

Create one provenance route per measurement family when production differs
(for example, classification metrics versus a separate quality-rating
pipeline). Use `reconstructed` when the complete route requires multiple
passages. Insert a Gap only at the unresolved position.

### 5. Connect Claims Last

Link a headline Claim only after its Results exist. Comparative Claims retain
both focal and comparator Results. If no reported Result supports a Claim,
create an `unsupported_claim` Gap. Salience evidence explains why a Claim is
headline; it does not count as support evidence.

Write a `headline_scan` entry for every frozen salient statement. Its
disposition is exactly one of: structural contribution, empirical Claim,
merged duplicate, local annotation, or excluded with reason.

Assign every Claim to at least one contribution group through
`headline_claim_ids`; allow overlap when a Claim honestly belongs to several
contributions. Do not put Claims in `member_node_ids`. Before finalizing,
compare the complete Claim inventory with the union of all
`headline_claim_ids` and require the difference to be empty. Never hide an
unsupported Claim by leaving it ungrouped.

### 6. Perform Bounded Self-Review

Run the complete rubric once. Make one correction pass for all material
findings. A second correction pass is allowed only when the first pass reveals
new omissions or contradictions. Never iterate merely to remove honest Gaps.
As part of the review, build a Gap-to-route incidence check: a Gap must appear
on every downstream route affected by its position, not merely one route for
the Result.

### 7. Finalize

Write `graph.json` exactly as specified by the graph contract. Write
`extraction-report.md` with:

- source used;
- coverage completed and exclusions;
- counts by node, edge, assertion level, result region, measurement, and Gap;
- unresolved ambiguities;
- self-review corrections;
- whether the extraction stopped cleanly.

## Stop Conditions

Finish when:

- every frozen coverage obligation is represented, explicitly excluded with a
  reason, or recorded as unresolved;
- every fully included table has zero missing or unexpected planned units;
- every reported measurement has evidence and a provenance route;
- every route reaches a root source and identifies its exact subject output;
- every route identifies its exact condition through `subject_variant` without
  unnecessary per-Result Artifact duplication;
- every transformation-bearing result label has a Procedure/Configuration or
  Gap disposition;
- every empirical headline Claim has result support or a Gap;
- every frozen headline obligation has a recorded disposition;
- no relation is stronger than its evidence;
- the review budget is exhausted or no material defect remains.

Stop and report the limitation instead of fabricating content when the source
is unreadable, incomplete, or lacks stable access to a required result region.

## Visualizing the graph (papergraph CLI)

After producing `graph.json` and `coverage-plan.json`:

1. Install the validator/viewer (either):
   - pip: `pip install papergraph`
   - zero-install: download `papergraph.pyz` from the GitHub Release, then
     `python3 papergraph.pyz ...`
2. Validate (structure only — passing is not a judgement of content
   correctness):
   ```
   papergraph validate --graph graph.json --coverage coverage-plan.json --source paper.json
   ```
3. Build the self-contained viewer:
   ```
   papergraph build --graph graph.json --coverage coverage-plan.json --source paper.json --out ./viewer-out
   ```
   Open `./viewer-out/index.standalone.html` in a browser — no server, no
   Python needed to view it.
