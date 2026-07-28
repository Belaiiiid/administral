"""User account and role — the security foundation.

Adapted from the `MonParcours` auth contribution into this project's module
layout and conventions (`TimestampMixin`, the shared `Base`). The three-role
enum is kept as the team defined it; the two roles the two journeys need are
`CITIZEN` and `AGENT`, with `ADMIN` reserved for agent-account provisioning.

How a citizen account differs from an agent account
---------------------------------------------------
By exactly one thing: the ``users.role`` column. There is **no** `agents`
table, and there must never be one. A single row in `users` is the whole
account, and its `role` is the only fact that decides what it may reach:

- ``Role.CITIZEN`` — self-service. Created by ``POST /api/auth/register``,
  which hardcodes this role and is the only unauthenticated way to create an
  account.
- ``Role.AGENT`` — back-office. Created by ``POST /api/auth/staff`` behind
  ``require_admin``, or out of band by ``scripts/create_staff.py``.
- ``Role.ADMIN`` — an agent who may additionally provision other staff.
  Admitted wherever an AGENT is (see `dependencies.require_role`).

Everything downstream reads this column and nothing else:

- the JWT ``role`` claim, minted in `security.create_access_token` from
  ``user.role`` and re-checked against the database on every request
  (`dependencies.get_current_user` reloads the row — a token cannot outlive a
  role change by more than its 30-minute lifetime);
- ``require_citizen`` / ``require_agent`` / ``require_admin``, the only guards
  any router attaches;
- the frontend's `sessionStore.toSessionRole`, which maps the role from
  ``/api/auth/me`` onto the two journeys.

The separate ``citizens`` table (`modules/agent/models.Citizen`) is **not** an
identity: it is the applicant *profile* attached to a case. It answers "what did
this person declare?", never "who is this and what may they do?".
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin


class Role(str, enum.Enum):
    CITIZEN = "CITIZEN"
    AGENT = "AGENT"
    ADMIN = "ADMIN"


class TokenPurpose(str, enum.Enum):
    """What an `AuthToken` entitles its bearer to do."""

    EMAIL_VERIFICATION = "EMAIL_VERIFICATION"
    PASSWORD_RESET = "PASSWORD_RESET"


class User(TimestampMixin, Base):
    """An authenticated account. One person, one row, one role."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    #: bcrypt hash — never the password itself, and never serialised.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(
        SAEnum(Role, name="user_role"), nullable=False, default=Role.CITIZEN
    )
    #: Whether the address in `email` has been proven to belong to this person.
    #: Applies to every role — an agent's address is verified the same way.
    #: Not currently a precondition for signing in: an unverified citizen can
    #: use the portal, and the UI nudges them. Making it blocking is a one-line
    #: change in `service.login`, deliberately left as a policy decision rather
    #: than baked in here.
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tokens: Mapped[list[AuthToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User id={self.id} email={self.email!r} role={self.role.value}>"


class AuthToken(TimestampMixin, Base):
    """A single-use, expiring capability sent to a user's email address.

    One table for both purposes rather than two near-identical ones. The
    security-critical parts — hashing the secret at rest, refusing an expired
    token, burning it on use — are then written once and cannot drift apart
    between "verify email" and "reset password", which is exactly the kind of
    divergence that leaves one of the two exploitable.

    **The raw token is never stored.** Only its SHA-256 digest is, so a dump of
    this table cannot be replayed to take over an account — the same reasoning
    that makes `users.password_hash` a hash. The raw value exists only inside
    the request that mints it, long enough to be put in an email.
    """

    __tablename__ = "auth_tokens"
    __table_args__ = (
        # Redemption looks a token up by digest; every read is this index.
        Index("ix_auth_tokens_token_hash", "token_hash", unique=True),
        Index("ix_auth_tokens_user_purpose", "user_id", "purpose"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user: Mapped[User] = relationship(back_populates="tokens")

    purpose: Mapped[TokenPurpose] = mapped_column(
        SAEnum(TokenPurpose, name="auth_token_purpose"), nullable=False
    )
    #: SHA-256 of the raw token, hex-encoded — 64 characters.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: Set the moment the token is redeemed. Non-null means spent: a token is
    #: kept rather than deleted so a second click gets "déjà utilisé" instead of
    #: the indistinguishable "lien invalide".
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AuthToken id={self.id} user_id={self.user_id} purpose={self.purpose.value}>"
