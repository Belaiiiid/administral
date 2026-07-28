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

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
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


class EmailDeliveryStatus(str, enum.Enum):
    sent = "sent"
    failed = "failed"


class DecisionEmailLog(Base):
    """One row per attempt to send a citizen the automatic decision e-mail.

    Append-only, like ``audit_events``: an ``updated_at`` would be a
    contradiction for a record of something that already happened. ``sent_at``
    is written by the database at insert time and doubles as "when this attempt
    was made", whether it succeeded or not — a failed attempt is still logged,
    per the delivery contract in ``notifications.service.send_decision_email``.

    ``application_id`` names the ``Case`` this decision belongs to (the
    "application" the citizen submitted, in this codebase's own vocabulary —
    see ``Case`` in ``agent.models``). CASCADE on both foreign keys: this log
    has no meaning once the case or the applicant it names is gone.
    """

    __tablename__ = "decision_email_log"
    __table_args__ = (Index("ix_decision_email_log_application_id", "application_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    citizen_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("citizens.id", ondelete="CASCADE"), nullable=False
    )
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    status: Mapped[EmailDeliveryStatus] = mapped_column(
        SAEnum(EmailDeliveryStatus, name="email_delivery_status"), nullable=False
    )
    #: The reason text actually placed in the e-mail — Mistral-generated and
    #: verified, or the deterministic "no verifiable justification" fallback.
    #: Never null: a reason is always produced before a send is attempted.
    generated_reason: Mapped[str] = mapped_column(Text, nullable=False)
    #: Populated only when ``status`` is ``failed``.
    delivery_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<DecisionEmailLog application={self.application_id} {self.status.value}>"
