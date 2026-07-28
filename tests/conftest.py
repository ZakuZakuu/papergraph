"""Shared fixtures for the papergraph test suite.

The golden fixture is the synthetic SynthNet graph (CC0-1.0, wholly invented;
see tests/fixtures/synthetic/LICENSE) — it must validate with zero errors.
Negative tests deep-copy the golden and apply one focused mutation each.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from papergraph import Source

_GOLDEN_DIR = Path(__file__).resolve().parent / "fixtures" / "synthetic"
_SOURCE_PATH = _GOLDEN_DIR / "paper.json"


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def golden_graph() -> dict:
    return _load(_GOLDEN_DIR / "graph.json")


@pytest.fixture(scope="session")
def golden_coverage() -> dict:
    return _load(_GOLDEN_DIR / "coverage-plan.json")


@pytest.fixture(scope="session")
def source() -> Source:
    return Source.from_path(_SOURCE_PATH)


@pytest.fixture
def graph(golden_graph) -> dict:
    """A fresh deep copy tests may mutate."""
    return copy.deepcopy(golden_graph)


@pytest.fixture
def coverage(golden_coverage) -> dict:
    return copy.deepcopy(golden_coverage)
