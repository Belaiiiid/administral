"""Persisted chat history — additive to the stateless engine, read/write side.

Kept out of `service.py` on purpose: `answer_question` is the engine seam and
must stay exactly as documented there ("le backend ne garde aucune session").
This module is the *other* thing the router calls, purely so an authenticated
citizen's thread survives leaving `/chat` and coming back. It never feeds
anything back into the engine — the client still resends
`conversationHistory` itself on the next question, unchanged.

Anonymous visitors never reach `record_turn` with a user (the router only
calls it when `current_user` is not `None`), so nothing is ever written for
them — the citizen's explicit requirement, not just an omission.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.chatbot.models import ChatbotMessage, ChatMessageRole
from app.modules.chatbot.schemas import ChatbotResponseSchema, ChatHistoryMessageSchema

logger = logging.getLogger(__name__)


def get_history(db: Session, user_id: int) -> list[ChatHistoryMessageSchema]:
    """This citizen's persisted conversation, oldest first."""
    stmt = (
        select(ChatbotMessage)
        .where(ChatbotMessage.user_id == user_id)
        .order_by(ChatbotMessage.created_at.asc())
    )
    return [
        ChatHistoryMessageSchema.model_validate(message)
        for message in db.execute(stmt).scalars().all()
    ]


def record_turn(
    db: Session,
    user_id: int,
    question: str,
    response: ChatbotResponseSchema,
) -> None:
    """Append the citizen's question and the assistant's answer, in order.

    Best-effort: the reply is already computed and shown to the citizen by the
    time this runs, so a persistence failure must be logged and swallowed, not
    surfaced as if the question itself had failed.
    """
    try:
        db.add(ChatbotMessage(user_id=user_id, role=ChatMessageRole.user, content=question))
        db.add(
            ChatbotMessage(
                user_id=user_id,
                role=ChatMessageRole.assistant,
                content=response.answer,
                sources=[s.model_dump(by_alias=True) for s in response.sources] or None,
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001 — persistence must never break a reply already sent
        logger.exception("Failed to persist chatbot turn for user %s", user_id)
        db.rollback()
