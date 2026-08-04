from __future__ import annotations

import json
from pathlib import Path

from papergraph.model import coverage_schema, schema_errors


_ROOT = Path(__file__).resolve().parents[1]
_TEMPLATE = _ROOT / "skills" / "extract-paper-evidence-graph" / "references" / "coverage-plan-template.json"


def test_skill_coverage_template_matches_the_executable_schema() -> None:
    template = json.loads(_TEMPLATE.read_text(encoding="utf-8"))

    assert schema_errors(template, coverage_schema()) == []
