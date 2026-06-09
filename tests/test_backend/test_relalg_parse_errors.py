import pytest

from backend.services.exceptions import ParseError
from backend.services.relalg import evaluate_expression


def test_parse_error_lists_user_facing_natural_join_aliases():
    with pytest.raises(ParseError) as exc_info:
        evaluate_expression(
            'pi{name}(sigma{semester="Spring"}(instructor join teaches))',
            "University",
        )

    message = exc_info.value.message
    assert "Expected one of:" in message
    assert "⋈, natural_join, natjoin, or njoin" in message
    assert "For natural join, use ⋈, natural_join, natjoin, or njoin." in message
    assert "* JOIN" not in message
    assert "Expected one of: JOIN" not in message
