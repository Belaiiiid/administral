"""The notification record.

One row is one message to one account (``user_id``). The recipient's role is not
stored here — it is a property of the user, and each notification simply belongs
to whichever user should see it. That keeps the query trivial ("my
notifications" is ``WHERE user_id = me``) and means a role never leaks another
role's messages: a citizen and an agent read the very same endpoint and each get
only their own rows.
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class NotificationType(str, enum.Enum):
    """What happened. Drives the icon/tone the UI picks, and nothing security.

    Named after the event, not the recipient: ``dossier_submitted`` is the same
    fact whether it reaches an agent (a new dossier to instruct) — it is only
    ever sent to the party the emitting code chooses.
    """

    #: A citizen submitted a dossier — sent to the agents who instruct the queue.
    dossier_submitted = "dossier_submitted"
    #: An agent validated a dossier — sent to the citizen who owns it.
    dossier_validated = "dossier_validated"
    #: An agent rejected a dossier — sent to the citizen who owns it.
    dossier_rejected = "dossier_rejected"
    #: A citizen contested a decision — sent to the agents who instruct the queue.
    contestation_filed = "contestation_filed"
    #: An agent resolved a contestation — sent to the citizen who filed it.
    contestation_resolved = "contestation_resolved"


class Notification(TimestampMixin, Base):
    """A single message addressed to one account."""

    __tablename__ = "notifications"
    __table_args__ = (
        # The list view is "my notifications, newest first"; the unread badge is
        # "my unread count". Both are served by this one composite index.
        Index("ix_notifications_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    #: The recipient. CASCADE: a notification has no meaning without its account.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[NotificationType] = mapped_column(
        SAEnum(NotificationType, name="notification_type"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    #: Optional deep-link handle — an ``application_number`` or case id the UI can
    #: turn into a link. A plain string, not a foreign key: a notification must
    #: outlive the thing it points at (a decision stays true after a case is
    #: purged), so it never cascades from one.
    reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        state = "read" if self.read else "unread"
        return f"<Notification id={self.id} user={self.user_id} {self.type.value} {state}>"
