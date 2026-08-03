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

from sqlalchemy import select
from sqlalchemy.orm import Session

# Le logger du projet, comme le reste du paquet. Ce module utilisait `logging` de la
# bibliothèque standard : la trace existait, mais dans un autre flux et un autre format
# que toutes les autres pannes de l'assistant. Une panne qu'il faut aller chercher
# ailleurs est à moitié invisible, et c'est précisément ce que l'observabilité de ce
# module devait clore.
from app.core.logger import logger
from app.database.session import SessionLocal
from app.modules.chatbot.models import ChatbotMessage, ChatMessageRole
from app.modules.chatbot.schemas import ChatbotResponseSchema, ChatHistoryMessageSchema


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
    user_id: int,
    question: str,
    response: ChatbotResponseSchema,
) -> None:
    """Append the citizen's question and the assistant's answer, in order.

    OUVRE SA PROPRE SESSION, très brève, au lieu d'en recevoir une du routeur.
    La session injectée par FastAPI vit le temps de toute la requête : elle était
    donc empruntée au pool AVANT le premier appel au modèle et rendue APRÈS le
    dernier, alors que la base n'est touchée qu'ici, à la toute fin. Une connexion
    PostgreSQL restait ainsi immobilisée pendant plusieurs secondes d'attente
    réseau, pour quelques millisecondes d'écriture.

    Le pool compte 5 connexions plus 10 d'appoint : une quinzaine de conversations
    simultanées suffisait à l'épuiser, et c'est alors TOUT LE RESTE de l'API qui
    attendait — l'authentification, les dossiers, les notifications. Le chatbot ne
    doit pas pouvoir emporter le portail avec lui.

    Best-effort : the reply is already computed and shown to the citizen by the
    time this runs, so a persistence failure must be logged and swallowed, not
    surfaced as if the question itself had failed.
    """
    try:
        with SessionLocal() as db:
            db.add(
                ChatbotMessage(user_id=user_id, role=ChatMessageRole.user, content=question)
            )
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
        logger.exception(
            "chatbot: persistance du tour impossible", {"user_id": user_id}
        )
