"""Tests for NIR masking.

Chosen as the first test because it is the one rule in the codebase whose
failure leaks personal data. It also needs no database, so it runs anywhere.

    .venv/Scripts/python -m pytest tests/
"""

from __future__ import annotations

from app.core.security import MASKED_PLACEHOLDER, mask_social_security_number


def test_keeps_sex_year_and_month() -> None:
    """The three groups an agent uses to confirm identity survive."""
    assert mask_social_security_number("291042500100138").startswith("2 91 04")


def test_hides_everything_after_the_month() -> None:
    """No digit beyond the fifth may appear in the output."""
    masked = mask_social_security_number("291042500100138")

    assert "2500100138" not in masked
    assert masked == "2 91 04 •• ••• ••• ••"


def test_tolerates_formatting() -> None:
    """Spaces in the stored value must not shift the mask."""
    assert mask_social_security_number("2 91 04 25 001 001 38") == "2 91 04 •• ••• ••• ••"


def test_unparseable_input_is_fully_masked() -> None:
    """A value too short to parse is masked entirely, never passed through.

    An unrecognised format is precisely when a permissive fallback would leak
    the raw value.
    """
    assert mask_social_security_number("abc") == MASKED_PLACEHOLDER
    assert mask_social_security_number("") == MASKED_PLACEHOLDER
