"""Tests for the auth security primitives — hashing, JWT, role guards.

No database: these exercise the pure security functions and the role-check
logic. The full login/protected-route flow is verified live against the API.
"""

from __future__ import annotations

import pytest

from app.modules.auth.models import Role, User
from app.modules.auth.security import (
    InvalidTokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_round_trips() -> None:
    hashed = hash_password("un-mot-de-passe-correct")
    assert hashed != "un-mot-de-passe-correct"  # never stored in clear
    assert verify_password("un-mot-de-passe-correct", hashed) is True
    assert verify_password("mauvais", hashed) is False


def test_verify_fails_closed_on_garbage_hash() -> None:
    """A malformed stored hash returns False, never raises."""
    assert verify_password("whatever", "not-a-bcrypt-hash") is False


def test_token_carries_subject_and_role() -> None:
    token = create_access_token(subject=42, role="AGENT")
    payload = decode_access_token(token)

    assert payload["sub"] == "42"
    assert payload["role"] == "AGENT"
    assert "exp" in payload and "iat" in payload


def test_tampered_token_is_rejected() -> None:
    token = create_access_token(subject=1, role="CITIZEN")
    with pytest.raises(InvalidTokenError):
        decode_access_token(token + "tamper")


def test_require_agent_refuses_a_citizen() -> None:
    """A citizen hitting an agent guard is refused with 403 — the DoD rule."""
    from fastapi import HTTPException

    from app.modules.auth.dependencies import require_agent

    guard = require_agent  # dependency callable
    citizen = User(id=1, first_name="C", last_name="Z", email="c@x.test",
                   password_hash="x", role=Role.CITIZEN)
    agent = User(id=2, first_name="A", last_name="G", email="a@x.test",
                 password_hash="x", role=Role.AGENT)

    with pytest.raises(HTTPException) as exc:
        guard(citizen)
    assert exc.value.status_code == 403

    # An agent passes through unchanged.
    assert guard(agent) is agent


def test_admin_is_admitted_where_agent_is() -> None:
    from app.modules.auth.dependencies import require_agent

    admin = User(id=3, first_name="A", last_name="D", email="ad@x.test",
                 password_hash="x", role=Role.ADMIN)
    assert require_agent(admin) is admin
