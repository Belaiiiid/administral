"""HTTP layer for the Citizen AI Assistant (migrated APL RAG).

Chemin et contrat conservés (`/citizen/chatbot/message`). Le token JWT est
optionnel et ne sert qu'à connaître le RÔLE de l'appelant (citoyen ou agent), qui
élargit le corpus interrogeable : l'assistant ne lit ni dossier ni profil du
compte (voir `service`). Sans token, il répond exactement pareil — c'est ce qui
permet d'exposer plus tard le même moteur sur un canal sans compte (WhatsApp).

Le moteur lui-même ne garde toujours aucune session : la conversation et l'état
de clarification transitent par la requête, exactement comme avant. Ce qui
s'ajoute ici est un second souci, indépendant du moteur : quand l'appelant est
un citoyen authentifié, chaque tour est aussi persisté (`history.py`) pour que
son fil de discussion survive une navigation hors de `/chat` — jamais pour un
visiteur non connecté, qui n'a explicitement rien de stocké.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.chatbot import history, service
from app.modules.chatbot.schemas import (
    ChatbotRequestSchema,
    ChatbotResponseSchema,
    ChatHistoryMessageSchema,
)
from app.modules.auth.dependencies import get_current_user, get_current_user_optional
from app.modules.auth.models import User

router = APIRouter(prefix="/citizen/chatbot", tags=["chatbot"])


@router.post(
    "/message",
    response_model=ChatbotResponseSchema,
    summary="Poser une question à l’assistant citoyen (RAG APL)",
    description=(
        "Assistant citoyen unique de MonParcours, propulsé par le RAG hybride APL "
        "(BM25 + Qdrant, orchestration LangGraph). Trois intentions : question "
        "générale sur la réglementation/démarche (réponse sourcée), documents "
        "nécessaires (questions de profilage puis checklist personnalisée), et "
        "hors-sujet. Une réponse peut être une question de clarification : elle "
        "porte alors `options` et `pendingClarification`, que l'UI renvoie avec "
        "`clarificationReply` — « option » si le citoyen a cliqué un choix, "
        "« text » s'il a écrit ou dicté sa réponse."
    ),
)
def send_message(
    body: ChatbotRequestSchema,
    current_user: Annotated[User | None, Depends(get_current_user_optional)],
    db: Annotated[Session, Depends(get_db)],
) -> ChatbotResponseSchema:
    response = service.answer_question(body.message, body.context, current_user)

    # Persistance pour l'affichage uniquement (voir `history.py`) : jamais pour
    # un visiteur anonyme, jamais relue par le moteur ci-dessus.
    if current_user is not None:
        history.record_turn(db, current_user.id, body.message, response)

    return response


@router.get(
    "/history",
    response_model=list[ChatHistoryMessageSchema],
    summary="Historique persisté de l'assistant (citoyen authentifié)",
    description=(
        "Le fil de discussion déjà tenu avec l'assistant, tel que persisté depuis "
        "`POST /message`. Réservé aux citoyens authentifiés : un visiteur anonyme "
        "n'a rien à relire puisque rien n'a été stocké pour lui."
    ),
)
def get_history(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ChatHistoryMessageSchema]:
    return history.get_history(db, current_user.id)
