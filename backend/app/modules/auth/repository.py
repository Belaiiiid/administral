"""Database access for accounts. The only layer that queries `users`."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.auth.models import Role, User


def get_by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def get_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def list_by_roles(db: Session, roles: Sequence[Role]) -> list[User]:
    """Every account holding one of ``roles``, newest first.

    The role column is the only thing consulted — there is no separate `agents`
    table to join, by design (see the module docstring in `models.py`).
    """
    stmt = select(User).where(User.role.in_(roles)).order_by(User.created_at.desc())
    return list(db.execute(stmt).scalars().all())


def create(db: Session, user: User) -> User:
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
