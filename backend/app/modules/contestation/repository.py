"""Database queries for contestations — the only layer that writes SQL here.

The convenience relationships on ``Contestation`` (case, citizen, decision) are
``lazy="joined"``, so a plain ``get`` already loads the context the schemas
need without an N+1. These functions add ordering and the queue filters.
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.agent.models import Case
from app.modules.contestation.models import Contestation, ContestationStatus

#: A challenge is "open" until it is resolved — used to refuse a second, parallel
#: contestation on a dossier that already has one in flight.
OPEN_STATUSES: tuple[ContestationStatus, ...] = (
    ContestationStatus.PENDING,
    ContestationStatus.UNDER_REVIEW,
)


def get_by_id(db: Session, contestation_id: str) -> Contestation | None:
    """One contestation with its case/citizen/decision context loaded."""
    return db.get(Contestation, contestation_id)


def get_case_by_application_number(db: Session, application_number: str) -> Case | None:
    """The dossier a citizen names when filing a contestation."""
    return db.execute(
        select(Case).where(Case.application_number == application_number)
    ).scalar_one_or_none()


def find_open_for_dossier(db: Session, dossier_id: str) -> Contestation | None:
    """An existing unresolved contestation on this dossier, if any."""
    return db.execute(
        select(Contestation)
        .where(
            Contestation.dossier_id == dossier_id,
            Contestation.status.in_(OPEN_STATUSES),
        )
        .limit(1)
    ).scalar_one_or_none()


def list_for_citizen(db: Session, citizen_id: str) -> Sequence[Contestation]:
    """This citizen's contestations, newest first."""
    return (
        db.execute(
            select(Contestation)
            .where(Contestation.citizen_id == citizen_id)
            .order_by(Contestation.created_at.desc())
        )
        .scalars()
        .all()
    )


def list_all(
    db: Session, *, status: ContestationStatus | None = None
) -> Sequence[Contestation]:
    """The agent queue. Oldest first — the order a queue is worked through.

    Unresolved before resolved is not expressed here as an ordering; the agent
    filters by ``status`` when they want only the open ones.
    """
    stmt = select(Contestation)
    if status is not None:
        stmt = stmt.where(Contestation.status == status)
    stmt = stmt.order_by(Contestation.created_at.asc())
    return db.execute(stmt).scalars().all()


def save(db: Session, contestation: Contestation) -> Contestation:
    """Persist a new or mutated contestation and its audit event together.

    Commits the caller's transaction — which, for the create/review/resolve
    flows, also holds the audit event `record` added — so the state change and
    its immutable trace are atomic.
    """
    db.add(contestation)
    db.commit()
    db.refresh(contestation)
    return contestation
