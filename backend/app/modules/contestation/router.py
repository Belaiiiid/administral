"""HTTP layer for contestations.

Two audiences behind one prefix, separated by guard, not by module:

- The citizen files a challenge and reads their own — ``require_citizen``. The
  dossier is named in the body; ownership is verified in the service, never here.
- The agent reviews and resolves — ``require_agent``. These routes expose every
  citizen's challenge, so a citizen token is refused (403).

Route order matters: ``/my`` is declared before ``/{contestation_id}`` so the
citizen's own list is not swallowed as an id.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.auth.dependencies import require_agent, require_citizen
from app.modules.auth.models import User
from app.modules.contestation import service
from app.modules.contestation.models import ContestationStatus
from app.modules.contestation.schemas import (
    ContestationCreateRequest,
    ContestationResolveRequest,
    ContestationSchema,
    ContestationSummarySchema,
)

router = APIRouter(prefix="/contestations", tags=["contestations"])


# ---------------------------------------------------------------------------
# Citizen
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=ContestationSchema,
    status_code=201,
    summary="Contester une décision (droit de contestation)",
    description=(
        "Le citoyen conteste la décision rendue sur son propre dossier. La "
        "référence désigne le dossier ; l’identité vient du jeton. Refusé si le "
        "dossier n’est pas le sien (403), n’a pas de décision (400), ou a déjà "
        "une contestation en cours (400)."
    ),
)
def create_contestation(
    body: ContestationCreateRequest,
    current_user: User = Depends(require_citizen),
    db: Session = Depends(get_db),
) -> ContestationSchema:
    return service.create_contestation(
        db,
        user=current_user,
        application_number=body.application_number,
        reason=body.reason,
        description=body.description,
    )


@router.get(
    "/my",
    response_model=list[ContestationSchema],
    summary="Mes contestations",
    description="Les contestations déposées par le citoyen connecté, plus récentes d’abord.",
)
def list_my_contestations(
    current_user: User = Depends(require_citizen),
    db: Session = Depends(get_db),
) -> list[ContestationSchema]:
    return service.list_my_contestations(db, user=current_user)


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[ContestationSummarySchema],
    dependencies=[Depends(require_agent)],
    summary="File des contestations",
    description="Les contestations à réexaminer, plus anciennes d’abord. Filtrable par statut.",
)
def list_contestations(
    db: Session = Depends(get_db),
    status: ContestationStatus | None = Query(
        default=None, description="Filtre sur un statut exact."
    ),
) -> list[ContestationSummarySchema]:
    return service.list_contestations(db, status=status)


@router.get(
    "/{contestation_id}",
    response_model=ContestationSchema,
    dependencies=[Depends(require_agent)],
    summary="Détail d’une contestation",
    description="La contestation complète : décision contestée, explication du citoyen, résolution.",
)
def get_contestation(
    contestation_id: str, db: Session = Depends(get_db)
) -> ContestationSchema:
    return service.get_contestation(db, contestation_id)


@router.patch(
    "/{contestation_id}/review",
    response_model=ContestationSchema,
    summary="Prendre une contestation en examen",
    description="Passe la contestation de PENDING à UNDER_REVIEW et enregistre l’agent examinateur.",
)
def review_contestation(
    contestation_id: str,
    agent: User = Depends(require_agent),
    db: Session = Depends(get_db),
) -> ContestationSchema:
    return service.start_review(db, contestation_id, agent=agent)


@router.patch(
    "/{contestation_id}/resolve",
    response_model=ContestationSchema,
    summary="Résoudre une contestation",
    description=(
        "L’agent accepte ou rejette la contestation, avec un motif obligatoire. "
        "La décision reste humaine ; la transition est tracée et le citoyen notifié."
    ),
)
def resolve_contestation(
    contestation_id: str,
    body: ContestationResolveRequest,
    agent: User = Depends(require_agent),
    db: Session = Depends(get_db),
) -> ContestationSchema:
    return service.resolve_contestation(
        db,
        contestation_id,
        agent=agent,
        accept=body.accept,
        resolution_comment=body.resolution_comment,
    )
