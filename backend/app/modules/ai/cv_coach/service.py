"""CV coach — the entry points the router calls. No DB, no `Application`:
both paths are stateless, matching the feature's design (the client holds
the conversation history, nothing persists past the response)."""

from __future__ import annotations

from app.modules.ai.cv_coach.mistral_client import chat_cv_coach_llm, review_cv_llm
from app.modules.ai.cv_coach.schemas import CvCoachTurn, CvReviewResult
from app.modules.citizen.extraction import extract_text

_CHAT_UNAVAILABLE = (
    "Désolé, je ne suis pas disponible pour le moment. Réessaie dans un instant, "
    "ou envoie directement ton CV pour un retour."
)


def chat(message: str, history: list[CvCoachTurn]) -> str:
    """One conversational turn. Never raises — a failure degrades to text,
    since this reply is dropped straight into a chat bubble."""
    reply = chat_cv_coach_llm(message, history)
    return reply if reply is not None else _CHAT_UNAVAILABLE


def _unavailable(reason: str) -> CvReviewResult:
    return CvReviewResult(available=False, unavailable_reason=reason)


def review_cv(cv_bytes: bytes, cv_mime_type: str) -> CvReviewResult:
    """Structured, one-shot review of an uploaded CV. Never raises."""
    extraction = extract_text(cv_bytes, cv_mime_type)
    if not extraction.text.strip():
        return _unavailable(
            extraction.error or "Le CV n'a pas pu être lu (fichier illisible ou vide)."
        )

    result = review_cv_llm(extraction.text)
    if result is None:
        return _unavailable("Analyse momentanément indisponible. Réessayez plus tard.")

    return CvReviewResult(available=True, **result)
