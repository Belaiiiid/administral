"""Read, create-on-first-need, and partial-update of a user's settings."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.auth.models import User
from app.modules.settings.models import UserSettings
from app.modules.settings.schemas import UserSettingsUpdate


def get_or_create(db: Session, user: User) -> UserSettings:
    """This user's settings row, materialising the defaults on first read.

    Created here rather than at registration so an account that never opens the
    settings page leaves no row behind — the defaults live in the model, and the
    row appears only once it has something to store.
    """
    settings = db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    ).scalar_one_or_none()
    if settings is not None:
        return settings

    settings = UserSettings(user_id=user.id)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def update(db: Session, user: User, patch: UserSettingsUpdate) -> UserSettings:
    """Apply a partial edit. Only the keys the client actually sent are changed."""
    settings = get_or_create(db, user)

    # `exclude_unset` is what makes this a PATCH: an omitted field is left alone,
    # not reset to its default.
    for field, value in patch.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)

    db.commit()
    db.refresh(settings)
    return settings


def wants_email(db: Session, user_id: int) -> bool:
    """Whether this user opted into e-mail copies of notifications.

    Defaults to True when no row exists yet — the model default — so a user who
    never touched their settings still gets the mail. A read-only helper for the
    notification emitters; never creates a row.
    """
    value = db.execute(
        select(UserSettings.email_notifications).where(UserSettings.user_id == user_id)
    ).scalar_one_or_none()
    return True if value is None else bool(value)
