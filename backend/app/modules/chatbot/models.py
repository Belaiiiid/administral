"""Persisted chat history — a display concern, not the engine's.

The RAG engine (`rag/orchestrator.py`, `service.answer_question`) stays exactly
as stateless as designed: it takes the full history as input on every call and
keeps nothing between requests, so the same engine still serves a session-free
channel (WhatsApp) unchanged. This table exists only so the web UI can show an
authenticated citizen their conversation again after they navigate away from
`/chat` and back — nothing here feeds back into the engine's own state.

An anonymous visitor never gets a row here: there is no account to attach a
message to, and the citizen explicitly must not have their conversation stored
at all in that case (see `history.record_turn`).
"""

from __future__ import annotations

import enum

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class ChatMessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"


class ChatbotMessage(TimestampMixin, Base):
    """One turn of a citizen's persisted conversation with the assistant."""

    __tablename__ = "chatbot_messages"
    __table_args__ = (
        # The only read is "my whole conversation, in order".
        Index("ix_chatbot_messages_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    #: CASCADE: a persisted message has no meaning without its account, and an
    #: account being deleted must not leave orphaned conversation rows behind.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[ChatMessageRole] = mapped_column(
        SAEnum(ChatMessageRole, name="chatbot_message_role"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    #: Mirrors `ChatbotSourceSchema`, absent on the citizen's own message.
    sources: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ChatbotMessage id={self.id} user={self.user_id} {self.role.value}>"
