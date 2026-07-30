"""HTTP layer for the CV coach. Stateless, no citizen identity required —
same reasoning as `ai.job_match.router`."""

from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.modules.ai.cv_coach.schemas import (
    CvCoachChatRequest,
    CvCoachChatResponse,
    CvReviewResult,
)
from app.modules.ai.cv_coach.service import chat, review_cv

router = APIRouter(prefix="/ai/cv-coach", tags=["ai-cv-coach"])

_ALLOWED_MIME = {"application/pdf", "image/jpeg", "image/png"}


@router.post(
    "/chat",
    response_model=CvCoachChatResponse,
    summary="Un tour de conversation avec le coach CV",
    description=(
        "Le coach pose des questions de relance sur l'expérience du candidat "
        "puis, une fois qu'il a assez d'éléments, répond avec un retour "
        "structuré (points forts / points à améliorer / conseils). Sans état "
        "côté serveur : l'historique fait l'aller-retour avec le client."
    ),
)
def chat_turn(payload: CvCoachChatRequest) -> CvCoachChatResponse:
    return CvCoachChatResponse(reply=chat(payload.message, payload.conversation_history))


@router.post(
    "/review",
    response_model=CvReviewResult,
    summary="Analyser un CV déjà rédigé",
    description=(
        "Retour structuré sur un CV envoyé directement : ce qui est déjà bien, "
        "ce qui manque, des conseils concrets — jamais un CV réécrit à la "
        "place du candidat."
    ),
)
async def review(cv: UploadFile = File(...)) -> CvReviewResult:
    if cv.content_type not in _ALLOWED_MIME:
        raise ValidationError(
            f"Type de fichier non accepté : {cv.content_type}. Formats acceptés : PDF, JPG, PNG."
        )

    data = await cv.read()
    if not data:
        raise ValidationError("Fichier vide.")
    if len(data) > settings.max_upload_bytes:
        raise ValidationError("Fichier trop volumineux (maximum 10 Mo).")

    return review_cv(data, cv.content_type or "application/pdf")
