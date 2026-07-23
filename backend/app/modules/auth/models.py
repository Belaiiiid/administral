"""User account and role — the security foundation.

Adapted from the `MonParcours` auth contribution into this project's module
layout and conventions (`TimestampMixin`, the shared `Base`). The three-role
enum is kept as the team defined it; the two roles the two journeys need are
`CITIZEN` and `AGENT`, with `ADMIN` reserved for agent-account provisioning.
"""

from __future__ import annotations

import enum

from sqlalchemy import Enum as SAEnum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class Role(str, enum.Enum):
    CITIZEN = "CITIZEN"
    AGENT = "AGENT"
    ADMIN = "ADMIN"


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

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User id={self.id} email={self.email!r} role={self.role.value}>"
