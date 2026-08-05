# Claim Comparison Connections

## Problem Statement

A comparative Claim can name a focal Result and one or more comparator Results.
The graph records the comparison through a support edge's declared comparison
references, but the canvas currently displays only the focal Result's direct
support edge. Readers can see the comparator in the Claim panel yet cannot
visually understand how it participates in the Claim without leaving the
evidence context or incorrectly inferring a second direct support relation.

The viewer also needs a concise explanation of its line meanings. Adding every
comparison as another normal support edge would make the graph denser and would
misstate the graph's semantics.

## Solution

In Claim browsing only, render a derived comparison connector from each
declared comparator Result to a small anchor on its focal Result's real support
edge. The connector visibly joins the comparison without claiming that the
comparator independently supports the Claim.

Add a lightweight line guide that explains structural relationships, support
relations, reconstructed relations, comparison connectors, and recorded Gaps.
The default Compact and Full views continue to show only the graph's real
nodes and edges.

## User Stories

1. As a paper reader, I want a comparative Claim to visibly include both its
   focal Result and comparator Result, so that I can understand the comparison
   without reconstructing it from panel text.
2. As a reader, I want the comparison connector to terminate on the focal
   support relation rather than on the Claim, so that I do not mistake a
   comparator for an independent support source.
3. As a reader, I want a comparison connector to appear only while browsing
   the relevant Claim, so that the default graph remains sparse and readable.
4. As a reader, I want the connector to lead to the support relation's
   declared evidence when I select it, so that I can inspect the exact Result
   rows and measurements involved.
5. As a reader, I want a comparator Result to remain inside Claim browsing
   when I inspect it, so that I can compare its route and measurements without
   losing my place.
6. As a reader, I want several comparators to have distinct connector anchors,
   so that overlapping references remain individually discoverable.
7. As a reader, I want a line guide, so that I can distinguish evidence flow,
   direct support, reconstruction, comparison context, and a recorded Gap.
8. As a reader, I want the guide to be available without permanently covering
   the graph, so that explanation does not compete with paper evidence.
9. As an extractor user, I want this visualization to use only declared
   comparison references, so that the viewer does not invent comparisons.
10. As a graph consumer, I want graph JSON and validation semantics to remain
    unchanged, so that existing artifacts continue to be portable.

## Implementation Decisions

- A comparison connector is a viewer-only projection derived from a support
  edge's declared comparison Result references. It is not a node, edge, or
  field written to the graph artifact.
- The real focal Result-to-Claim support edge remains the only direct support
  relation. A comparison connector joins the comparator to a small anchor on
  that real edge instead of drawing a second comparator-to-Claim edge.
- Structural relations retain their subdued treatment. Real support edges
  retain their Claim emphasis and their existing explicit-versus-reconstructed
  solid/dashed distinction. Comparison connectors use a distinct teal dotted
  treatment; their source support edge remains the authority for assertion
  level.
- A connector exists only while its Claim is in Claim browsing. It has no
  effect on the default Compact or Full graph, force layout, graph topology, or
  exported data.
- Connector anchors are deterministic. Multiple comparators on one support
  edge receive evenly spaced anchor positions so they do not collapse onto one
  hit target.
- Selecting a comparison connector opens the originating real support edge in
  the adjacent inspector, where the declared comparative measurements and
  rationale are visible.
- A compact Line guide control exposes the line semantics. It is a transient
  canvas-adjacent overlay rather than permanent in-canvas labels.
- Existing Claim browsing recognizes declared comparator Results as contextual
  inspection targets and expands their compact Result group where needed.

## Testing Decisions

- Test the viewer projection, not a fabricated graph rewrite: a declared
  comparator should yield a selectable derived connector only in Claim
  browsing, while no-comparator graphs remain unchanged.
- Test multiple comparators for deterministic, distinct anchors and hit
  targets.
- Test selection end to end: a connector opens the originating support edge;
  a comparator Result preserves the Claim browser and opens its Result
  inspector.
- Test that the Line guide explains every visible line category and that the
  bundled viewer retains the feature after a normal build.
- Reuse the synthetic comparison fixture and existing build-product viewer
  tests as the primary regression seam. Manually inspect the Transformer
  comparative Claim as the real-paper acceptance example.

## Out of Scope

- Changing the graph schema, validator, extraction Skill, or source paper.
- Inferring a comparison that is absent from declared comparison references.
- Displaying virtual comparison connectors in the default Compact or Full
  graph.
- Turning comparison connectors into direct support edges or altering support
  assertion levels.
- Adding a general force-layout control surface.

## Further Notes

This feature extends the comparative evidence panel. The panel remains the
authoritative textual explanation; the connector is a navigational projection
of the same declared information.
