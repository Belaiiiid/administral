"""Database access for accounts. The only layer that queries `users`."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.auth.models import User


def get_by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def get_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def create(db: Session, user: User) -> User:
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
