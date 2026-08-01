"""HTTP layer for job-offer match analysis.

Stateless and needs no citizen identity — unlike the citizen document routes,
this never touches an `Application`, so it takes no `applicationId` and no
`require_citizen` dependency.
"""

from __future__ import annotations

from fastapi import APIRouter, File, Form, UploadFile

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.modules.ai.job_match.schemas import JobMatchAnalysis
from app.modules.ai.job_match.service import analyze_job_match

router = APIRouter(prefix="/ai/job-match", tags=["ai-job-match"])

_ALLOWED_MIME = {"application/pdf", "image/jpeg", "image/png"}


@router.post(
    "/analyze",
    response_model=JobMatchAnalysis,
    summary="Analyser une candidature face à une offre d'emploi",
    description=(
        "Compare un CV à une offre d'emploi collée en texte libre : compétences "
        "requises, correspondantes et manquantes, documents à préparer, et une "
        "estimation prudente des chances d'obtenir un entretien. Sans clé Mistral "
        "configurée ou si le CV est illisible, renvoie `available: false` plutôt "
        "qu'un résultat inventé."
    ),
)
async def analyze(
    cv: UploadFile = File(...),
    offer_text: str = Form(...),
) -> JobMatchAnalysis:
    if cv.content_type not in _ALLOWED_MIME:
        raise ValidationError(
            f"Type de fichier non accepté : {cv.content_type}. Formats acceptés : PDF, JPG, PNG."
        )
    if not offer_text.strip():
        raise ValidationError("Le texte de l'offre d'emploi est requis.")

    data = await cv.read()
    if not data:
        raise ValidationError("Fichier vide.")
    if len(data) > settings.max_upload_bytes:
        raise ValidationError("Fichier trop volumineux (maximum 10 Mo).")

    return analyze_job_match(offer_text, data, cv.content_type or "application/pdf")
