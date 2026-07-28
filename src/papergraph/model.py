"""Executable schema + typed access for the paper evidence graph (0.2).

The JSON Schema files under ``papergraph/schemas/`` are the *single executable
source of truth* for ``paper-evidence-graph/0.2`` (graph.json) and
``paper-evidence-coverage/0.1`` (coverage-plan.json). The skill's
``graph-contract.md`` is a human-facing mirror of these files.

Because the frozen test environment has no ``jsonschema`` dependency (and the
task forbids installs), this module ships a small, deterministic validator for
the exact Draft 2020-12 keyword subset the two schema files use:

    type, enum, const, pattern, minLength, minItems, maxItems,
    properties, required, additionalProperties, items,
    allOf, anyOf, oneOf, if / then / else, and local ``$ref`` (``#/$defs/...``).

It reports **every** structural error in one pass (deterministic pre-order),
never short-circuiting — the same discipline as the frozen claim-centered
linter. Semantic aptness / claim-truth are out of scope by construction.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterator

from papergraph._resources import read_schema

GRAPH_FORMAT_VERSION = "paper-evidence-graph/0.2"
COVERAGE_FORMAT_VERSION = "paper-evidence-coverage/0.1"

GRAPH_SCHEMA_FILE = "graph-schema.json"
COVERAGE_SCHEMA_FILE = "coverage-schema.json"


@lru_cache(maxsize=None)
def _load_schema(filename: str) -> dict[str, Any]:
    return json.loads(read_schema(filename))


def graph_schema() -> dict[str, Any]:
    """The executable graph.json schema (single source of truth)."""
    return _load_schema(GRAPH_SCHEMA_FILE)


def coverage_schema() -> dict[str, Any]:
    """The executable coverage-plan.json schema."""
    return _load_schema(COVERAGE_SCHEMA_FILE)


# --- structural (schema) error ------------------------------------------------


@dataclass(frozen=True)
class SchemaError:
    path: str
    message: str

    def to_dict(self) -> dict[str, str]:
        return {"path": self.path, "message": self.message}


# --- the deterministic mini-validator ----------------------------------------

_TYPE_CHECKS = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "null": lambda v: v is None,
    # bool is a subclass of int in Python; JSON integer/number must not be bool.
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
}


def _resolve_ref(ref: str, root: dict[str, Any]) -> dict[str, Any]:
    if not ref.startswith("#/"):
        raise ValueError(f"unsupported $ref (only local refs allowed): {ref}")
    node: Any = root
    for token in ref[2:].split("/"):
        token = token.replace("~1", "/").replace("~0", "~")
        node = node[token]
    return node


def _type_ok(value: Any, type_spec: Any) -> bool:
    names = type_spec if isinstance(type_spec, list) else [type_spec]
    return any(_TYPE_CHECKS.get(name, lambda _v: True)(value) for name in names)


def _matches(value: Any, schema: dict[str, Any], root: dict[str, Any]) -> bool:
    """True when ``value`` satisfies ``schema`` (used for if/oneOf/anyOf)."""
    return not _collect(value, schema, root, "", stop_early=True)


def _collect(
    value: Any,
    schema: dict[str, Any],
    root: dict[str, Any],
    path: str,
    *,
    stop_early: bool = False,
) -> list[SchemaError]:
    """Return all schema violations of ``value`` against ``schema``."""
    errors: list[SchemaError] = []

    def add(where: str, message: str) -> bool:
        errors.append(SchemaError(where or "$", message))
        return stop_early  # signal caller to bail when only truthiness matters

    if "$ref" in schema:
        target = _resolve_ref(schema["$ref"], root)
        errors.extend(_collect(value, target, root, path, stop_early=stop_early))
        if stop_early and errors:
            return errors

    if "const" in schema and value != schema["const"]:
        if add(path, f"must equal {schema['const']!r}") and errors:
            return errors

    if "enum" in schema and value not in schema["enum"]:
        if add(path, f"must be one of {schema['enum']!r}") and errors:
            return errors

    if "type" in schema and not _type_ok(value, schema["type"]):
        add(path, f"expected type {schema['type']!r}, got {type(value).__name__}")
        return errors  # further keyword checks assume the base type

    if isinstance(value, str):
        pattern = schema.get("pattern")
        if pattern is not None and re.search(pattern, value) is None:
            if add(path, f"does not match pattern {pattern!r}") and errors:
                return errors
        min_length = schema.get("minLength")
        if min_length is not None and len(value) < min_length:
            if add(path, f"shorter than minLength {min_length}") and errors:
                return errors

    if isinstance(value, list):
        min_items = schema.get("minItems")
        if min_items is not None and len(value) < min_items:
            if add(path, f"has {len(value)} items, fewer than minItems {min_items}") and errors:
                return errors
        max_items = schema.get("maxItems")
        if max_items is not None and len(value) > max_items:
            if add(path, f"has {len(value)} items, more than maxItems {max_items}") and errors:
                return errors
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                errors.extend(
                    _collect(item, item_schema, root, f"{path}[{index}]", stop_early=stop_early)
                )
                if stop_early and errors:
                    return errors

    if isinstance(value, dict):
        properties = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                if add(f"{path}.{key}" if path else key, "required property is missing") and errors:
                    return errors
        additional = schema.get("additionalProperties", True)
        for key in value:
            child_path = f"{path}.{key}" if path else key
            if key in properties:
                errors.extend(
                    _collect(value[key], properties[key], root, child_path, stop_early=stop_early)
                )
                if stop_early and errors:
                    return errors
            elif additional is False:
                if add(child_path, "additional property is not allowed") and errors:
                    return errors
            elif isinstance(additional, dict):
                errors.extend(
                    _collect(value[key], additional, root, child_path, stop_early=stop_early)
                )
                if stop_early and errors:
                    return errors

    for sub in schema.get("allOf", []):
        errors.extend(_collect(value, sub, root, path, stop_early=stop_early))
        if stop_early and errors:
            return errors

    if "anyOf" in schema and not any(_matches(value, sub, root) for sub in schema["anyOf"]):
        if add(path, "does not match any of the allowed schemas") and errors:
            return errors

    if "oneOf" in schema:
        matched = sum(1 for sub in schema["oneOf"] if _matches(value, sub, root))
        if matched != 1:
            if add(path, f"must match exactly one schema (matched {matched})") and errors:
                return errors

    if "if" in schema:
        branch = "then" if _matches(value, schema["if"], root) else "else"
        if branch in schema:
            errors.extend(_collect(value, schema[branch], root, path, stop_early=stop_early))
            if stop_early and errors:
                return errors

    return errors


def schema_errors(instance: Any, schema: dict[str, Any]) -> list[SchemaError]:
    """All structural violations of ``instance`` against ``schema`` (one pass)."""
    return _collect(instance, schema, schema, "")


# --- typed access -------------------------------------------------------------

# Reserved kind-specific fields that must live at the node top level, never in
# ``details`` (graph-contract.md §3).
CLAIM_TOP_LEVEL_FIELDS = ("claim_form", "salience_evidence_ids")
RESULT_TOP_LEVEL_FIELDS = ("system_or_condition", "paper_locator", "measurements")
NODE_RESERVED_FIELDS = tuple(dict.fromkeys(CLAIM_TOP_LEVEL_FIELDS + RESULT_TOP_LEVEL_FIELDS))


def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


class GraphView:
    """Read-only indexed access over a graph.json document.

    Tolerant of malformed input: accessors never raise, so the validator can
    report *every* error in one pass rather than dying on the first fault.
    """

    def __init__(self, graph: Any):
        self.raw: dict = _as_dict(graph)

    @property
    def nodes(self) -> list[dict]:
        return [_as_dict(n) for n in _as_list(self.raw.get("nodes"))]

    @property
    def edges(self) -> list[dict]:
        return [_as_dict(e) for e in _as_list(self.raw.get("edges"))]

    @property
    def gaps(self) -> list[dict]:
        return [_as_dict(g) for g in _as_list(self.raw.get("gaps"))]

    @property
    def routes(self) -> list[dict]:
        return [_as_dict(r) for r in _as_list(self.raw.get("provenance_routes"))]

    @property
    def evidence_spans(self) -> list[dict]:
        return [_as_dict(e) for e in _as_list(self.raw.get("evidence_spans"))]

    @property
    def contribution_groups(self) -> list[dict]:
        return [_as_dict(c) for c in _as_list(self.raw.get("contribution_groups"))]

    @property
    def result_region_scan(self) -> list[dict]:
        return [_as_dict(r) for r in _as_list(self.raw.get("result_region_scan"))]

    @property
    def headline_scan(self) -> list[dict]:
        return [_as_dict(h) for h in _as_list(self.raw.get("headline_scan"))]

    def nodes_by_id(self) -> dict[str, dict]:
        return {n["id"]: n for n in self.nodes if isinstance(n.get("id"), str)}

    def node_kind(self, node_id: str) -> str | None:
        node = self.nodes_by_id().get(node_id)
        kind = node.get("kind") if node else None
        return kind if isinstance(kind, str) else None

    def edges_by_id(self) -> dict[str, dict]:
        return {e["id"]: e for e in self.edges if isinstance(e.get("id"), str)}

    def gaps_by_id(self) -> dict[str, dict]:
        return {g["id"]: g for g in self.gaps if isinstance(g.get("id"), str)}

    def routes_by_id(self) -> dict[str, dict]:
        return {r["id"]: r for r in self.routes if isinstance(r.get("id"), str)}

    def evidence_by_id(self) -> dict[str, dict]:
        return {e["id"]: e for e in self.evidence_spans if isinstance(e.get("id"), str)}

    def iter_measurements(self) -> Iterator[tuple[dict, dict]]:
        """Yield ``(result_node, measurement)`` for every measurement."""
        for node in self.nodes:
            if node.get("kind") == "result":
                for meas in _as_list(node.get("measurements")):
                    yield node, _as_dict(meas)

    def measurements_by_id(self) -> dict[str, dict]:
        return {
            m["id"]: m
            for _node, m in self.iter_measurements()
            if isinstance(m.get("id"), str)
        }

    def reported_measurement_ids(self) -> set[str]:
        return {
            m["id"]
            for _node, m in self.iter_measurements()
            if isinstance(m.get("id"), str) and m.get("availability") == "reported"
        }
