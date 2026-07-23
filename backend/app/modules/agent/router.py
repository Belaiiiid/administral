"""HTTP layer for the agent module.

Receives requests, delegates, returns responses. It holds no business rule — if
a condition here started deciding *which* cases matter, it would belong in the
service, where the queue and the counters can share it.

⚠️ Unauthenticated. These endpoints expose case data and must sit behind the
agent auth guard before this reaches any shared environment — see
``app/core/security.py``, where the dependency belongs, and ``modules/auth/``,
which is still a placeholder.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.agent import service
from app.modules.agent.models import CaseStatus
from app.modules.agent.schemas import (
    CaseDecisionSchema,
    CaseDetailSchema,
    CaseQueueStatsSchema,
    CaseSummarySchema,
    DecisionRequestSchema,
)

router = APIRouter(prefix="/agent", tags=["agent"])


# Declared before any `/cases/{case_id}` route, so a future detail endpoint
# cannot swallow `/cases/stats` as an id.
@router.get(
    "/cases/stats",
    response_model=CaseQueueStatsSchema,
    summary="Compteurs de charge de travail",
    description=(
        "Agrégats calculés sur l’ensemble des dossiers, pas sur une page. "
        "Le client ne doit jamais compter les lignes lui-même."
    ),
)
def get_queue_stats(db: Session = Depends(get_db)) -> CaseQueueStatsSchema:
    return service.get_queue_stats(db)


@router.get(
    "/cases",
    response_model=list[CaseSummarySchema],
    summary="File d’instruction",
    description=(
        "Liste des dossiers, triés du plus ancien au plus récent — l’ordre dans "
        "lequel une file d’instruction se traite."
    ),
)
def list_cases(
    db: Session = Depends(get_db),
    status: CaseStatus | None = Query(
        default=None,
        description="Filtre sur un statut exact.",
    ),
    search: str | None = Query(
        default=None,
        description="Recherche libre sur la référence et le nom de l’allocataire.",
    ),
    pending_decision: bool = Query(
        default=False,
        alias="pendingDecision",
        description=(
            "Restreint aux dossiers en attente de décision. Indicateur sémantique "
            "et non liste de statuts : la règle appartient au serveur."
        ),
    ),
) -> list[CaseSummarySchema]:
    # An unrecognised `status` is rejected by FastAPI as a 422 before reaching
    # here, because the parameter is typed as the enum. Silently ignoring a bad
    # filter would return *more* cases than asked for.
    return service.list_cases(
        db,
        status=status,
        search=search,
        pending_decision=pending_decision,
    )


@router.get(
    "/cases/{case_id}",
    response_model=CaseDetailSchema,
    summary="Dossier complet",
    description="Le dossier entier : pièces, rapports de complétude et de cohérence, décision.",
)
def get_case(case_id: str, db: Session = Depends(get_db)) -> CaseDetailSchema:
    return service.get_case(db, case_id)


@router.post(
    "/cases/{case_id}/decision",
    response_model=CaseDecisionSchema,
    status_code=201,
    summary="Enregistrer une décision",
    description=(
        "L’agent choisit l’issue ; le serveur extrait les éléments justificatifs du "
        "dossier et rédige l’explication à partir d’eux. Un rejet sans motif "
        "vérifiable est refusé (400)."
    ),
)
def decide_case(
    case_id: str,
    body: DecisionRequestSchema,
    db: Session = Depends(get_db),
) -> CaseDecisionSchema:
    # Only the outcome comes from the client. Evidence and explanation are
    # derived server-side from the case — a client able to supply them could
    # justify a decision with facts the record does not contain.
    return service.decide_case(db, case_id, body.outcome)
