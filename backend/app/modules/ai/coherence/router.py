"""HTTP layer for coherence analysis."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.agent.repository import find_case_by_id
from app.modules.agent.schemas import CoherenceReportSchema
from app.modules.ai.coherence.schemas import CoherenceRequest, ResultatCoherence
from app.modules.ai.coherence.service import analyser_coherence, generer_et_persister_rapport

router = APIRouter(prefix="/ai/coherence", tags=["ai-coherence"])


@router.post(
    "/analyze",
    response_model=ResultatCoherence,
    summary="Analyser la cohérence transverse d'un dossier",
    description=(
        "Compare le profil déclaré aux données extraites des documents et rend un "
        "verdict traçable (coherent / incoherent / a_revoir). Sans clé Mistral "
        "configurée, le dossier est marqué « a_revoir » — jamais déclaré cohérent "
        "sans vérification."
    ),
)
def analyze(body: CoherenceRequest) -> ResultatCoherence:
    return analyser_coherence(body.profil_declare, body.documents_extraits)


@router.post(
    "/cases/{case_id}/report",
    response_model=CoherenceReportSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Générer et persister le rapport de cohérence (C6)",
    description=(
        "Lance l'analyse de cohérence C1 sur le dossier identifié par `case_id`, "
        "persiste le résultat en base (upsert — idempotent), et retourne le rapport. "
        "Retourne 404 si le dossier n'existe pas. "
        "Retourne 201 à la création ou au remplacement d'un rapport existant."
    ),
)
def generate_report(
    case_id: str,
    body: CoherenceRequest,
    db: Session = Depends(get_db),
) -> CoherenceReportSchema:
    case = find_case_by_id(db, case_id)
    if case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case '{case_id}' not found.",
        )

    report = generer_et_persister_rapport(
        db,
        case=case,
        profil=body.profil_declare,
        documents=body.documents_extraits,
    )

    return CoherenceReportSchema.model_validate(report)
