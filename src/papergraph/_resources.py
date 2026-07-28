"""Single entry point for reading package-bundled resources.

``schemas/`` and ``viewer/`` ship as data alongside the package (not as
sub-packages). ``Path(__file__)``-style access breaks inside a zipapp
(``.pyz``), since there is no real filesystem path to a member of a zip
archive. ``importlib.resources`` reads work identically whether papergraph is
installed as loose files, as a wheel, or run straight out of a ``.pyz``.
"""
from __future__ import annotations

from importlib import resources

_PACKAGE = "papergraph"


def read_schema(filename: str) -> str:
    return resources.files(_PACKAGE).joinpath("schemas", filename).read_text(encoding="utf-8")


def read_viewer_asset(filename: str) -> str:
    return resources.files(_PACKAGE).joinpath("viewer", filename).read_text(encoding="utf-8")
