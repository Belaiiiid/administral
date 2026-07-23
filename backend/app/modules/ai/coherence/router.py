"""HTTP layer for coherence analysis."""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.ai.coherence.schemas import CoherenceRequest, ResultatCoherence
from app.modules.ai.coherence.service import analyser_coherence

router = APIRouter(prefix="/ai/coherence", tags=["ai-coherence"])


@router.post(
    "/analyze",
    response_model=ResultatCoherence,
    summary="Analyser la cohérence transverse d’un dossier",
    description=(
        "Compare le profil déclaré aux données extraites des documents et rend un "
        "verdict traçable (coherent / incoherent / a_revoir). Sans clé Mistral "
        "configurée, le dossier est marqué « a_revoir » — jamais déclaré cohérent "
        "sans vérification."
    ),
)
def analyze(body: CoherenceRequest) -> ResultatCoherence:
    return analyser_coherence(body.profil_declare, body.documents_extraits)
