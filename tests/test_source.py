from __future__ import annotations

import pytest

from papergraph.source import Source


def test_duplicate_span_ids_are_rejected() -> None:
    document = {
        "pages": [
            {
                "page": 1,
                "text": "first second",
                "spans": [
                    {"span_id": "p1-s1", "text": "first"},
                    {"span_id": "p1-s1", "text": "second"},
                ],
            }
        ]
    }

    with pytest.raises(ValueError, match="duplicate span_id"):
        Source.from_normalized_document(document)


def test_quote_occurs_normalizes_whitespace_before_closing_punctuation() -> None:
    source = Source({"p1-s1": "The cost is O(n · d2 ) ."})

    assert source.quote_occurs("The cost is O(n · d2).", ["p1-s1"])


def test_quote_occurs_joins_a_hyphenated_span_boundary_without_dropping_hyphen() -> None:
    source = Source({"p1-s1": "English-", "p1-s2": "to-German translation"})

    assert source.quote_occurs("English-to-German translation", ["p1-s1", "p1-s2"])
    assert not source.quote_occurs("Englishto-German translation", ["p1-s1", "p1-s2"])
