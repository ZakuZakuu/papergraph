"""Packaging guard: the built wheel actually contains schemas/ + viewer/.

Declaring package-data in pyproject.toml is not proof it was packaged; this
builds a real wheel and inspects its zip contents. Slow-ish (invokes the
build backend as a subprocess) so it is one test, not a per-file matrix.
"""
from __future__ import annotations

import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

pytest.importorskip("build")

_REPO_ROOT = Path(__file__).resolve().parent.parent

_REQUIRED_MEMBERS = (
    "papergraph/schemas/graph-schema.json",
    "papergraph/schemas/coverage-schema.json",
    "papergraph/viewer/index.html",
    "papergraph/viewer/app.js",
    "papergraph/viewer/styles.css",
)


def test_wheel_contains_schemas_and_viewer(tmp_path):
    out_dir = tmp_path / "dist"
    proc = subprocess.run(
        [sys.executable, "-m", "build", "--wheel", "-o", str(out_dir)],
        cwd=_REPO_ROOT, capture_output=True, text=True,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr

    wheels = list(out_dir.glob("*.whl"))
    assert len(wheels) == 1, wheels

    with zipfile.ZipFile(wheels[0]) as z:
        names = set(z.namelist())
    missing = [m for m in _REQUIRED_MEMBERS if m not in names]
    assert not missing, f"wheel is missing: {missing}"
