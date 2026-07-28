"""HTTP layer for the audit trail.

Reading the trail is a staff act: an agent consults a dossier's history to
ground an assisted review or answer a citizen's contestation, so the trail
routes sit behind ``require_agent``. The chain-integrity diagnostics — "has any
past entry been tampered with?" — are an administrative concern and sit behind
``require_admin``.

The trail is read-only over HTTP by design: there is no endpoint that writes an
audit event. Events are written only from inside the domain flows they record
(submission, decision, profile edit), atomically with the action — never by a
client call, which could otherwise forge history.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.audit import service
from app.modules.audit.schemas import (
    AuditEventSchema,
    AuditTrailResponse,
    ChainIntegrityResponse,
)
from app.modules.auth.dependencies import require_admin, require_agent

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get(
    "/verify",
    response_model=ChainIntegrityResponse,
    dependencies=[Depends(require_admin)],
    summary="Vérifier l’intégrité de la chaîne d’audit",
    description=(
        "Recalcule toute la chaîne de hachage SHA-256 et signale la première "
        "entrée altérée, le cas échéant. Réservé à l’administration."
    ),
)
def verify_chain(db: Session = Depends(get_db)) -> ChainIntegrityResponse:
    intact, first_broken = service.verify_chain(db)
    total = len(service.list_recent(db, limit=10_000))
    return ChainIntegrityResponse(
        intact=intact, first_broken_event_id=first_broken, total_events=total
    )


@router.get(
    "/recent",
    response_model=list[AuditEventSchema],
    dependencies=[Depends(require_admin)],
    summary="Événements d’audit récents",
    description="Les événements les plus récents, tous dossiers confondus. Réservé à l’administration.",
)
def recent(db: Session = Depends(get_db)) -> list[AuditEventSchema]:
    return [AuditEventSchema.model_validate(e) for e in service.list_recent(db)]


@router.get(
    "/{entity_type}/{entity_id}",
    response_model=AuditTrailResponse,
    dependencies=[Depends(require_agent)],
    summary="Journal d’audit d’un dossier ou d’un profil",
    description=(
        "L’historique complet, du plus ancien au plus récent, pour une entité "
        "donnée (par exemple `case` / `APL-…`). Accompagné d’un contrôle "
        "d’intégrité de la chaîne globale."
    ),
)
def trail(
    entity_type: str, entity_id: str, db: Session = Depends(get_db)
) -> AuditTrailResponse:
    events = service.list_for_entity(db, entity_type=entity_type, entity_id=entity_id)
    intact, _ = service.verify_chain(db)
    return AuditTrailResponse(
        entity_type=entity_type,
        entity_id=entity_id,
        events=[AuditEventSchema.model_validate(e) for e in events],
        chain_intact=intact,
    )
