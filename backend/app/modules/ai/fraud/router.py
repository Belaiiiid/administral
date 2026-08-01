"""HTTP layer for document fraud analysis (Agent C4).

Standalone entry point for Swagger and local testing: upload one file, get the
forensic result back. No authentication, no dossier, no persistence — the temp
file is deleted as soon as the analysis completes.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, File, UploadFile

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.modules.ai.fraud import service as fraud_service
from app.modules.ai.fraud.schemas import FraudAnalysisSchema

router = APIRouter(prefix="/ai/fraud", tags=["ai-fraud"])

_ALLOWED_SUFFIXES = {".pdf", ".jpg", ".jpeg", ".png"}


@router.post(
    "/analyze",
    response_model=FraudAnalysisSchema,
    summary="Analyser un document (anti-fraude C4)",
    description=(
        "Téléverse un fichier PDF ou image et renvoie immédiatement le résultat "
        "de l'analyse forensique (métadonnées, intégrité, ELA/TruFor si activés, "
        "verdict Mistral optionnel). Aucune authentification ni dossier requis — "
        "le fichier n'est pas conservé après l'analyse."
    ),
)
async def analyze_upload(file: UploadFile = File(...)) -> FraudAnalysisSchema:
    data = await file.read()
    if not data:
        raise ValidationError("Fichier vide.")
    if len(data) > settings.max_upload_bytes:
        raise ValidationError("Fichier trop volumineux (maximum 10 Mo).")

    suffix = Path(file.filename or "document").suffix.lower()
    if suffix not in _ALLOWED_SUFFIXES:
        raise ValidationError(
            f"Format non accepté ({suffix or 'sans extension'}). "
            "Formats acceptés : PDF, JPG, JPEG, PNG."
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        return fraud_service.analyze_document(
            tmp_path,
            display_name=file.filename or "document",
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)
