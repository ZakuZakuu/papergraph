"""Hard guard: papergraph ships zero third-party runtime dependencies.

Walks every .py file under src/papergraph and asserts every top-level import
resolves to either the standard library or papergraph itself. This is the
mechanical enforcement of the "pure stdlib" constraint frozen in the migration
design (pyproject.toml declares zero `dependencies`; this test makes sure the
code actually honors that, not just the manifest).
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parent.parent / "src" / "papergraph"
_STDLIB = set(sys.stdlib_module_names) | {"__future__"}


def _top_level_imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.level and node.level > 0:
                continue  # relative import within papergraph
            if node.module:
                names.add(node.module.split(".")[0])
    return names


def test_every_module_imports_only_stdlib_or_self():
    offenders: dict[str, set[str]] = {}
    for path in sorted(_SRC.rglob("*.py")):
        imported = _top_level_imports(path)
        bad = {n for n in imported if n != "papergraph" and n not in _STDLIB}
        if bad:
            offenders[str(path.relative_to(_SRC.parent.parent))] = bad
    assert not offenders, f"non-stdlib imports found: {offenders}"
