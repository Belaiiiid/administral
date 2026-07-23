"""Pytest configuration for the backend test suite.

Sets the minimal environment variables required for ``Settings`` to
instantiate without a real ``.env`` file. Only the fields that have no
default are stubbed here.
"""

from __future__ import annotations

import os


def pytest_configure(config) -> None:
    """Inject required env vars before any module is imported."""
    os.environ.setdefault("DATABASE_USER", "test_user")
    os.environ.setdefault("DATABASE_PASSWORD", "test_password")

