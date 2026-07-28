"""Wire contracts for the notification endpoints. camelCase out, like the rest."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.modules.notifications.models import NotificationType


class _Base(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


class NotificationResponse(_Base):
    id: int
    type: NotificationType
    title: str
    body: str
    reference: str | None = None
    read: bool
    read_at: datetime | None = None
    created_at: datetime


class NotificationListResponse(_Base):
    """The list plus the unread count, so the page and the header badge agree
    from one round-trip."""

    items: list[NotificationResponse]
    unread_count: int


class UnreadCountResponse(_Base):
    unread_count: int
