"""HTTP layer for the Citizen AI Assistant (migrated APL RAG).

Same path and contract as the assistant it replaces (`/citizen/chatbot/message`),
so the existing chatbot frontend is untouched. Reuses MonParcours' JWT auth: the
citizen is identified from their token, which is what lets the dossier intent
answer about *their* dossier.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
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
        "(BM25 + Qdrant, orchestration LangGraph). Les questions générales sur la "
        "réglementation/démarche APL sont traitées par le RAG avec citations ; les "
        "questions sur le dossier du citoyen sont renvoyées vers le workflow dossier "
        "de MonParcours."
    ),
)
def send_message(
    body: ChatbotRequestSchema,
    current_user: Annotated[User | None, Depends(get_current_user_optional)],
    db: Annotated[Session, Depends(get_db)],
) -> ChatbotResponseSchema:
    return service.answer_question(body.message, body.context, db, current_user)
