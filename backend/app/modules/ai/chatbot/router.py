"""HTTP layer for the citizen assistant."""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.ai.chatbot import service
from app.modules.ai.chatbot.schemas import ChatbotRequestSchema, ChatbotResponseSchema

router = APIRouter(prefix="/citizen/chatbot", tags=["chatbot"])


@router.post(
    "/message",
    response_model=ChatbotResponseSchema,
    summary="Poser une question à l’assistant",
    description=(
        "Répond à une question de démarche et cite les documents sur lesquels la "
        "réponse s’appuie. L’assistant ne modifie aucun dossier, ne calcule aucun "
        "droit et ne statue sur aucune éligibilité."
    ),
)
def send_message(body: ChatbotRequestSchema) -> ChatbotResponseSchema:
    return service.answer_question(body.message, body.context)
