"""The per-account settings row.

One row per user (``user_id`` unique), created lazily on first read. Every column
carries a sensible default, so a user who never opened the settings page still
has well-defined preferences — the row is a materialisation of those defaults the
moment they change one, not a precondition for the account to work.

The columns span both roles. Which ones a given role may actually change is a UI
concern; storing them together keeps one table and one query. A citizen-only flag
left at its default on an agent's row is harmless — nothing reads it there.
"""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class UserSettings(TimestampMixin, Base):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    #: The owner. Unique — one settings row per account. CASCADE: settings have
    #: no meaning without the account they belong to.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    #: Receive an e-mail copy of notifications, not only the in-app entry. Applies
    #: to every role; the citizen decision e-mail honours it today.
    email_notifications: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # --- Citizen preferences ---
    #: Show the AI assistant (profiling / chatbot). A citizen who prefers to fill
    #: forms unaided can turn it off; the UI respects this.
    ai_assistance: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    #: Consent to sharing declared data across administrations. Off by default —
    #: consent is opt-in, and this row is the record of that choice.
    cross_administration_sharing: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<UserSettings user={self.user_id}>"
