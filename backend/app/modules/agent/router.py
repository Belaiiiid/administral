"""HTTP layer for the agent module.

Receives requests, delegates, returns responses. It holds no business rule — if
a condition here started deciding *which* cases matter, it would belong in the
service, where the queue and the counters can share it.

Every route here is behind ``require_agent``: these endpoints expose citizen
dossiers, so a caller without a valid AGENT (or ADMIN) token is refused. A
citizen token reaches these routes and gets 403 — the access-control guarantee
this portal now rests on.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.agent import service
from app.modules.agent.assessment import MonParcoursResult
from app.modules.agent.models import CaseStatus
from app.modules.agent.schemas import (
    CaseDecisionSchema,
    CaseDetailSchema,
    CaseListPageSchema,
    CaseQueueStatsSchema,
    CaseSortField,
    CaseSummarySchema,
    DecisionRequestSchema,
    SortDirection,
)
from app.modules.auth.dependencies import require_agent
from app.modules.auth.models import User

# The guard is applied at the router level, so it covers every current and
# future agent route without each having to remember it.
router = APIRouter(prefix="/agent", tags=["agent"], dependencies=[Depends(require_agent)])


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
    "/cases/list",
    response_model=CaseListPageSchema,
    summary="Liste des dossiers CAF — paginée, triable, filtrable",
    description=(
        "Projection dédiée au tableau de bord instructeur : score, complétude, "
        "cohérence et statut anti-fraude déjà calculés, jamais recalculés ici. "
        "Déclarée avant `/cases/{case_id}` pour ne pas être capturée comme un id."
    ),
)
def list_case_page(
    db: Session = Depends(get_db),
    status: CaseStatus | None = Query(default=None, description="Filtre sur un statut exact."),
    search: str | None = Query(
        default=None,
        description="Recherche libre sur la référence du dossier ou le nom de l’allocataire.",
    ),
    sort_by: CaseSortField = Query(default=CaseSortField.submitted_at, alias="sortBy"),
    sort_dir: SortDirection = Query(default=SortDirection.desc, alias="sortDir"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
) -> CaseListPageSchema:
    return service.list_case_page(
        db,
        status=status,
        search=search,
        # `.name`, not `.value`: the enum's value is the camelCase wire form
        # (`submittedAt`), its name is the snake_case key
        # `repository.SORTABLE_COLUMNS` is keyed by.
        sort_by=sort_by.name,
        sort_dir=sort_dir.value,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/cases/{case_id}",
    response_model=CaseDetailSchema,
    summary="Dossier complet",
    description="Le dossier entier : pièces, rapports de complétude et de cohérence, décision.",
)
def get_case(case_id: str, db: Session = Depends(get_db)) -> CaseDetailSchema:
    return service.get_case(db, case_id)


@router.get(
    "/cases/{case_id}/assessment",
    response_model=MonParcoursResult,
    summary="MonParcours Result — évaluation unifiée du dossier",
    description=(
        "Score global déterministe (complétude 35 %, cohérence 30 %, qualité "
        "documentaire 20 %, vigilance 15 %) et les quatre catégories, chacune "
        "avec score, statut, explication et preuves, plus les actions de revue "
        "recommandées. Aide à l’instruction : l’IA ne décide pas de l’éligibilité."
    ),
)
def get_case_assessment(
    case_id: str,
    db: Session = Depends(get_db),
    agent: User = Depends(require_agent),
) -> MonParcoursResult:
    return service.get_case_assessment(db, case_id, agent=agent)


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
    agent: User = Depends(require_agent),
) -> CaseDecisionSchema:
    # Only the outcome comes from the client. Evidence and explanation are
    # derived server-side from the case — a client able to supply them could
    # justify a decision with facts the record does not contain. The acting
    # `agent` is resolved from the token so the decision carries a real human's
    # name and the audit trace records who ruled.
    return service.decide_case(db, case_id, body.outcome, agent=agent)
