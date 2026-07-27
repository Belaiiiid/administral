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


def test_require_citizen_refuses_an_agent() -> None:
    """The APL profile belongs to an applicant: staff must not open one.

    `require_citizen` is the one guard that does *not* widen to agent/admin —
    an agent hitting it would have `resolve_citizen` create a `citizens` row for
    a person who has no housing-aid profile. It must be a hard 403.
    """
    from fastapi import HTTPException

    from app.modules.auth.dependencies import require_citizen

    citizen = User(id=10, first_name="C", last_name="Z", email="c@x.test",
                   password_hash="x", role=Role.CITIZEN)
    agent = User(id=11, first_name="A", last_name="G", email="a@x.test",
                 password_hash="x", role=Role.AGENT)
    admin = User(id=12, first_name="A", last_name="D", email="ad@x.test",
                 password_hash="x", role=Role.ADMIN)

    assert require_citizen(citizen) is citizen  # the applicant passes
    for staff in (agent, admin):
        with pytest.raises(HTTPException) as exc:
            require_citizen(staff)
        assert exc.value.status_code == 403


def test_require_admin_refuses_an_agent() -> None:
    """Staff provisioning is admin-only: an AGENT must not mint another agent."""
    from fastapi import HTTPException

    from app.modules.auth.dependencies import require_admin

    agent = User(id=4, first_name="A", last_name="G", email="ag@x.test",
                 password_hash="x", role=Role.AGENT)
    with pytest.raises(HTTPException) as exc:
        require_admin(agent)
    assert exc.value.status_code == 403


def test_provision_staff_schema_refuses_citizen() -> None:
    """The staff body cannot express CITIZEN — public registration owns that role."""
    from pydantic import ValidationError

    from app.modules.auth.schemas import ProvisionStaffRequest

    payload = {
        "firstName": "A", "lastName": "G",
        "email": "ag@example.fr", "password": "motdepasse123",
    }
    assert ProvisionStaffRequest(**payload).role is Role.AGENT
    assert ProvisionStaffRequest(**payload, role="ADMIN").role is Role.ADMIN

    with pytest.raises(ValidationError):
        ProvisionStaffRequest(**payload, role="CITIZEN")


# ---------------------------------------------------------------------------
# Email verification / password reset tokens
# ---------------------------------------------------------------------------


def test_token_is_stored_only_as_a_digest() -> None:
    """The raw token must never be recoverable from what the table holds."""
    from app.modules.auth.tokens import hash_token

    raw = "un-jeton-brut"
    digest = hash_token(raw)

    assert digest != raw
    assert len(digest) == 64  # SHA-256, hex
    assert hash_token(raw) == digest  # deterministic — it is a lookup key
    assert hash_token(raw + "x") != digest


def test_reset_email_links_to_the_frontend_not_the_api() -> None:
    """A link opened from a mail client must land on a page, not on JSON."""
    from app.core.config import settings
    from app.modules.auth.notifications import password_reset_email, verification_email

    reset = password_reset_email(to="c@example.fr", first_name="Camille", token="JETON")
    verify = verification_email(to="c@example.fr", first_name="Camille", token="JETON")

    for message in (reset, verify):
        assert settings.frontend_base_url.rstrip("/") in message.body
        assert "token=JETON" in message.body

    assert "/reinitialiser-mot-de-passe?token=JETON" in reset.body
    assert "/verifier-email?token=JETON" in verify.body


def test_console_backend_does_not_swallow_the_message() -> None:
    """The dev backend must render the whole email, link included — it is the
    only way a developer gets the token without an SMTP server."""
    import io
    from contextlib import redirect_stdout

    from app.core.email import ConsoleEmailBackend, Email

    buffer = io.StringIO()
    with redirect_stdout(buffer):
        ConsoleEmailBackend().send(
            Email(to="c@example.fr", subject="Sujet", body="corps avec https://lien?token=ABC")
        )

    written = buffer.getvalue()
    assert "c@example.fr" in written
    assert "token=ABC" in written


def test_unknown_email_backend_fails_loudly() -> None:
    """Rather than silently logging reset links in an environment meant to send them."""
    from app.core import email as email_module
    from app.core.config import settings

    original = settings.email_backend
    settings.email_backend = "sendgrid-typo"
    try:
        with pytest.raises(RuntimeError, match="EMAIL_BACKEND inconnu"):
            email_module.get_email_backend()
    finally:
        settings.email_backend = original
