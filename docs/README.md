# papergraph Documentation

This directory is the durable, versioned documentation for the `papergraph`
product. It moves with the source code and is reviewed with behavior changes.

| Location | Purpose |
| --- | --- |
| `product/` | Current user-facing behavior and interaction model. |
| `decisions/` | Architectural decisions that constrain future work. |
| `releases/` | Notes tying a released version to its verified behavior. |

Paper PDFs, extraction outputs, screenshots, and exploratory run records do
not belong here. They live in the workspace-level `.scratch/papergraph/`
directory, where each demo has its own input, run, and acceptance record.

## Source-of-truth rule

`src/papergraph/viewer/` is the only source for viewer code. `papergraph build`
copies those bundled assets verbatim into an output directory. A viewer under
`.scratch/` is a generated artifact, never a release source.
