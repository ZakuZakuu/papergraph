# Claim-First Viewer

## Purpose

The viewer helps a reader identify a paper's central claims, inspect the
evidence chain behind each claim, and then move into exact reported results.
It validates and presents graph structure; it does not claim to establish the
semantic truth of a paper's conclusions.

## Default: Compact

Compact is the default view. It preserves the exact graph while folding only
multiple Result nodes that share the same non-empty `paper_locator`. The folded
node inherits the member Results' visible relationships. Selecting it reveals
its individual Results; the members never disappear from the underlying graph.

Compact is intentionally lossless at the graph-data level. A Result without a
foldable sibling remains a normal Result node.

## Full

Full renders every real graph node and edge directly, including each Result.
It is the inspection view for a reader who needs exact table rows, conditions,
measurements, and edge-level provenance.

## Claim Browsing

Selecting a Claim opens the Claim browser and highlights its complete evidence
chain: supporting Results, their upstream provenance, relevant edges, and any
declared Gap. Result aggregates that are needed for the chain expand only for
that browse state. Exiting Claim browsing restores the prior aggregation state.

When a Claim has several Gaps, the viewer emphasizes them but leaves detailed
Gap inspection to the reader rather than opening an arbitrary one.

## Inspection

The Claim browser remains open while an adjacent node inspector can show a
selected Result, Artifact, Procedure, Configuration, or Gap. Both panels and
the left rail can be resized. Provenance is rendered as a folded tree inside
Claim and Result inspection so branching routes remain readable in constrained
panel space. Clicking a real tree entry selects the corresponding graph node.

## Layout

The default layout is deterministic and follows the evidence flow from inputs
through procedures/configurations and Results to Claims. Its force relaxation
is deliberately local: dragging one node preserves the rest of the map, while
short-range collision handling prevents overlaps. The reset control restores
the deterministic layout and camera framing.
