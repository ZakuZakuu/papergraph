"""papergraph — mechanical validator + (later) viewer for paper evidence graphs.

Issue 01 (schema + model) and Issue 02 (validator + report) are implemented
here. The JSON Schema under ``schemas/`` is the single executable source of
truth for ``paper-evidence-graph/0.2``; the skill's ``graph-contract.md`` mirrors
it. The validator is format-only: it never judges semantic correctness.
"""
from __future__ import annotations

from papergraph.model import (
    COVERAGE_FORMAT_VERSION,
    GRAPH_FORMAT_VERSION,
    GraphView,
    coverage_schema,
    graph_schema,
    schema_errors,
)
from papergraph.cli import main
from papergraph.report import LintIssue, LintReport
from papergraph.source import Source
from papergraph.validator import validate

__all__ = [
    "main",
    "GRAPH_FORMAT_VERSION",
    "COVERAGE_FORMAT_VERSION",
    "GraphView",
    "graph_schema",
    "coverage_schema",
    "schema_errors",
    "LintIssue",
    "LintReport",
    "Source",
    "validate",
]
