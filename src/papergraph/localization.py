"""Validation and loading for optional PaperGraph localization sidecars.

The evidence graph remains the canonical, validator-owned artifact. A
localization sidecar only supplies display text keyed by stable graph IDs, so
language support can evolve without widening the graph contract.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

LOCALIZATION_FORMAT_VERSION = "papergraph-localization/0.1"
LOCALIZATION_DIR = "locales"


class LocalizationError(ValueError):
    """Raised when a localization sidecar cannot be used with a graph."""


def graph_digest(graph: Any) -> str:
    """Return a formatting-independent digest for a graph object."""
    payload = json.dumps(
        graph, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _mapping(value: Any, where: str) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise LocalizationError(f"{where} must be an object")
    return value


def _string_fields(value: Any, where: str) -> None:
    if not isinstance(value, dict):
        raise LocalizationError(f"{where} must be an object")
    for key, text in value.items():
        if not isinstance(key, str) or not isinstance(text, str) or not text.strip():
            raise LocalizationError(f"{where}.{key} must be a non-empty string")


def _validate_entries(payload: dict[str, Any], known: set[str], section: str) -> None:
    entries = _mapping(payload.get(section), section)
    unknown = sorted(set(entries) - known)
    if unknown:
        raise LocalizationError(
            f"{section} contains unknown graph ids: {', '.join(unknown[:5])}"
        )
    for item_id, value in entries.items():
        _string_fields(value, f"{section}[{item_id!r}]")


def validate_localization(payload: Any, graph: Any, *, filename: str = "<memory>") -> dict[str, Any]:
    """Validate one sidecar and return it unchanged.

    The sidecar is intentionally permissive about which display fields a
    translator supplies, but strict about locale identity, graph identity, and
    stable IDs. This makes partial translations safe while preventing stale
    translations from silently attaching to another graph.
    """
    if not isinstance(payload, dict):
        raise LocalizationError(f"{filename}: top level must be an object")
    if payload.get("format_version") != LOCALIZATION_FORMAT_VERSION:
        raise LocalizationError(
            f"{filename}: format_version must be {LOCALIZATION_FORMAT_VERSION!r}"
        )
    locale = payload.get("locale")
    if not isinstance(locale, str) or not locale.strip() or "/" in locale or "\\" in locale:
        raise LocalizationError(f"{filename}: locale must be a safe non-empty string")
    expected_digest = graph_digest(graph)
    if payload.get("source_graph_sha256") != expected_digest:
        raise LocalizationError(
            f"{filename}: source_graph_sha256 does not match the supplied graph"
        )

    paper = payload.get("paper", {})
    _string_fields(paper, "paper")
    nodes = graph.get("nodes", []) if isinstance(graph, dict) else []
    groups = graph.get("contribution_groups", []) if isinstance(graph, dict) else []
    gaps = graph.get("gaps", []) if isinstance(graph, dict) else []
    known_nodes = {item.get("id") for item in nodes if isinstance(item, dict)}
    known_groups = {item.get("id") for item in groups if isinstance(item, dict)}
    known_gaps = {item.get("id") for item in gaps if isinstance(item, dict)}
    known_measurements = {
        measurement.get("id")
        for node in nodes
        if isinstance(node, dict)
        for measurement in node.get("measurements", [])
        if isinstance(measurement, dict)
    }
    known_nodes.discard(None)
    known_groups.discard(None)
    known_gaps.discard(None)
    _validate_entries(payload, known_nodes, "nodes")
    _validate_entries(payload, known_groups, "groups")
    _validate_entries(payload, known_gaps, "gaps")
    _validate_entries(payload, known_measurements, "measurements")

    return payload


def load_localizations(locales_dir: str | Path | None, graph: Any) -> dict[str, dict[str, Any]]:
    """Load and validate all ``*.json`` sidecars in a locale directory."""
    if locales_dir is None:
        return {}
    directory = Path(locales_dir)
    if not directory.exists():
        raise LocalizationError(f"locales directory not found: {directory}")
    if not directory.is_dir():
        raise LocalizationError(f"locales path is not a directory: {directory}")
    files = sorted(directory.glob("*.json"))
    if not files:
        raise LocalizationError(f"locales directory contains no JSON files: {directory}")
    loaded: dict[str, dict[str, Any]] = {}
    for path in files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise LocalizationError(f"{path}: invalid JSON ({exc})") from exc
        except OSError as exc:
            raise LocalizationError(f"cannot read localization {path}: {exc}") from exc
        checked = validate_localization(payload, graph, filename=str(path))
        locale = checked["locale"]
        if locale in loaded:
            raise LocalizationError(f"duplicate localization locale: {locale}")
        loaded[locale] = checked
    return loaded
