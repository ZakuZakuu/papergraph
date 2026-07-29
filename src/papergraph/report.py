"""Structured lint report for papergraph.

Mirrors the ``LintIssue`` / ``LintReport`` shape and the all-errors-in-one-pass
discipline of the frozen claim-centered linter, but is an independent type owned
by papergraph (no coupling to the v2.x experiment protocol). Serializable to
``graph.lint.json``.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class LintIssue:
    code: str
    path: str
    message: str
    layer: str = "structural"  # "schema" | "reference" | "structural" | "coverage" | "privacy"

    def to_dict(self) -> dict[str, str]:
        return {"code": self.code, "path": self.path, "message": self.message, "layer": self.layer}


@dataclass(frozen=True)
class LintReport:
    valid: bool
    errors: tuple[LintIssue, ...] = ()

    @property
    def error_count(self) -> int:
        return len(self.errors)

    def codes(self) -> list[str]:
        return [issue.code for issue in self.errors]

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "error_count": self.error_count,
            "errors": [issue.to_dict() for issue in self.errors],
        }

    def to_json(self, *, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=True, indent=indent, sort_keys=True) + "\n"

    def write(self, path: str | Path) -> None:
        Path(path).write_text(self.to_json(), encoding="utf-8")


@dataclass
class IssueCollector:
    """Append-only issue accumulator (no short-circuit)."""

    issues: list[LintIssue] = field(default_factory=list)

    def add(self, code: str, path: str, message: str, layer: str = "structural") -> None:
        self.issues.append(LintIssue(code=code, path=path or "$", message=message, layer=layer))

    def extend(self, issues: list[LintIssue]) -> None:
        self.issues.extend(issues)

    def report(self) -> LintReport:
        return LintReport(valid=not self.issues, errors=tuple(self.issues))
