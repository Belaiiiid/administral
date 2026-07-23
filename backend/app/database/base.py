"""Declarative base for every SQLAlchemy model.

Kept in its own module, separate from ``session`` and ``models``, to break a
circular import: models import ``Base`` from here, and Alembic imports the
models. If ``Base`` lived alongside the engine, importing a model would drag a
database connection into scope — including at migration time, before the
database necessarily exists.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """SQLAlchemy 2.x declarative base."""


class TimestampMixin:
    """``created_at`` / ``updated_at``, maintained by PostgreSQL.

    ``server_default`` and ``onupdate`` rather than Python defaults: a row
    written by a migration, a seed script or a manual ``psql`` statement gets
    correct timestamps too, not just rows written through the ORM.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
