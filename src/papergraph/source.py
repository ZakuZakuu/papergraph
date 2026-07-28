"""Authoritative-source access for quote / span checks.

The validator never trusts an author-supplied ``quote``; it re-derives the text
from the authoritative source (the normalized-JSON span catalog) and checks that
the quote actually occurs there.

This module is self-contained: it depends only on the Python standard library
and reimplements the tiny slice of span-catalog + display-normalization logic it
needs directly against the normalized-paper JSON. It imports nothing from the
sibling extraction packages, so that ``papergraph`` remains an
independently-publishable, pure-stdlib package.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_LINEBREAK_HYPHEN = re.compile(r"([A-Za-z])-\n[ \t]*([a-z])")
_WS_RUN = re.compile(r"\s+")


def normalize_display(raw: str) -> str:
    """Layout-normalize display text: heal line-break hyphenation, collapse whitespace."""
    joined = _LINEBREAK_HYPHEN.sub(r"\1\2", raw)
    return _WS_RUN.sub(" ", joined).strip()


class Source:
    """Wraps a span catalog and exposes span existence + quote checks."""

    def __init__(self, catalog: dict[str, str]):
        self._catalog = catalog

    @classmethod
    def from_normalized_document(cls, document: dict[str, Any]) -> "Source":
        catalog: dict[str, str] = {}
        for page in document.get("pages", []):
            for span in page.get("spans", []):
                span_id = span["span_id"]
                if span_id in catalog:
                    raise ValueError(f"duplicate span_id in catalog: {span_id}")
                catalog[span_id] = span["text"]
        return cls(catalog)

    @classmethod
    def from_path(cls, path: str | Path) -> "Source":
        document = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls.from_normalized_document(document)

    def has_span(self, span_id: str) -> bool:
        return isinstance(span_id, str) and span_id in self._catalog

    def span_text(self, span_id: str) -> str | None:
        """Stored display text of a source span, or ``None``."""
        if not self.has_span(span_id):
            return None
        return self._catalog[span_id]

    def quote_occurs(self, quote: str, source_span_ids: list[str]) -> bool:
        """True when ``quote`` is found within the cited source spans.

        Both sides are put through ``normalize_display`` (the only tolerated
        layout transform), then the quote must be a substring of the space-joined
        span texts. This is a mechanical anti-fabrication check for *presence*
        only, not for evidence aptness. Unknown spans cannot ground a quote, so
        they make the check fail here (their absence is also reported separately
        as ``unknown_source_span``).
        """
        if not isinstance(quote, str) or not source_span_ids:
            return False
        if any(not self.has_span(s) for s in source_span_ids):
            return False
        haystack = normalize_display(" ".join(self.span_text(s) for s in source_span_ids))
        needle = normalize_display(quote)
        return bool(needle) and needle in haystack
