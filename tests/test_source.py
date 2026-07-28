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
