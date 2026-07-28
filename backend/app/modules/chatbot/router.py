"""HTTP layer for the Citizen AI Assistant (migrated APL RAG).

Chemin et contrat conservés (`/citizen/chatbot/message`). Le token JWT est
optionnel et ne sert qu'à connaître le RÔLE de l'appelant (citoyen ou agent), qui
élargit le corpus interrogeable : l'assistant ne lit ni dossier ni profil du
compte (voir `service`). Sans token, il répond exactement pareil — c'est ce qui
permet d'exposer plus tard le même moteur sur un canal sans compte (WhatsApp).

Aucune session de base de données n'est nécessaire : la conversation et l'état de
clarification transitent par la requête.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.modules.chatbot import service
from app.modules.chatbot.schemas import ChatbotRequestSchema, ChatbotResponseSchema
from app.modules.auth.dependencies import get_current_user_optional
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
        "`isClarificationReply`."
    ),
)
def send_message(
    body: ChatbotRequestSchema,
    current_user: Annotated[User | None, Depends(get_current_user_optional)],
) -> ChatbotResponseSchema:
    return service.answer_question(body.message, body.context, current_user)
