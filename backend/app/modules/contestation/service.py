"""Contestation business logic.

Owns the rules of the challenge: who may open one, on what, the state machine it
moves through, and the guarantee that every transition is written into the
immutable audit trail atomically with the state change. The repository owns SQL,
the router owns HTTP; this is where "a citizen may only contest their own decided
dossier" and "a resolution must carry a human's reasoning" live.

The AI never appears here. A contestation is opened by a citizen and resolved by
an agent — the module records the human acts and never adjudicates the merits.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.modules.agent.models import Case, CaseStatus
from app.modules.audit import service as audit_service
from app.modules.audit.models import AuditAction
from app.modules.auth.models import User
from app.modules.contestation import repository
from app.modules.contestation.models import (
    REASON_LABELS,
    Contestation,
    ContestationReason,
    ContestationStatus,
)
from app.modules.contestation.schemas import (
    ContestationSchema,
    ContestationSummarySchema,
    ContestedDecisionSchema,
)
from app.modules.notifications import service as notifications_service

# ---------------------------------------------------------------------------
# State machine — pure, DB-free, and independently tested.
# ---------------------------------------------------------------------------

#: A dossier is only contestable once an agent has ruled on it. There is nothing
#: to challenge before a decision exists.
DECIDED_STATUSES: frozenset[CaseStatus] = frozenset(
    {CaseStatus.validated, CaseStatus.rejected}
)

#: The two terminal outcomes an agent may resolve a challenge into.
RESOLVED_STATUSES: frozenset[ContestationStatus] = frozenset(
    {ContestationStatus.ACCEPTED, ContestationStatus.REJECTED}
)

#: The only status changes the flow permits. A resolution may be reached either
#: straight from PENDING or after UNDER_REVIEW; the terminal states go nowhere.
_ALLOWED_TRANSITIONS: dict[ContestationStatus, frozenset[ContestationStatus]] = {
    ContestationStatus.PENDING: frozenset(
        {ContestationStatus.UNDER_REVIEW, *RESOLVED_STATUSES}
    ),
    ContestationStatus.UNDER_REVIEW: frozenset(RESOLVED_STATUSES),
    ContestationStatus.ACCEPTED: frozenset(),
    ContestationStatus.REJECTED: frozenset(),
}


def can_transition(current: ContestationStatus, target: ContestationStatus) -> bool:
    """Whether ``current → target`` is a permitted status change."""
    return target in _ALLOWED_TRANSITIONS[current]


def _ensure_transition(current: ContestationStatus, target: ContestationStatus) -> None:
    if not can_transition(current, target):
        raise ValidationError(
            f"Transition de contestation invalide : « {current.value} » → "
            f"« {target.value} » n’est pas autorisée."
        )


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------


def _citizen_name(case: Case) -> str:
    full = f"{case.citizen.first_name} {case.citizen.last_name}".strip()
    return full or case.citizen.email


def _decision_context(case: Case) -> ContestedDecisionSchema | None:
    if case.decision is None:
        return None
    d = case.decision
    return ContestedDecisionSchema(
        outcome=d.outcome.value,
        explanation=d.explanation,
        decided_by=d.decided_by,
        decided_at=d.created_at,
    )


def _to_schema(contestation: Contestation) -> ContestationSchema:
    case = contestation.case
    return ContestationSchema(
        id=contestation.id,
        dossier_id=contestation.dossier_id,
        application_number=case.application_number,
        citizen_id=contestation.citizen_id,
        citizen_name=_citizen_name(case),
        original_decision_id=contestation.original_decision_id,
        reason=contestation.reason,
        reason_label=REASON_LABELS[contestation.reason],
        description=contestation.description,
        status=contestation.status,
        reviewed_by=contestation.reviewed_by,
        resolution_comment=contestation.resolution_comment,
        created_at=contestation.created_at,
        updated_at=contestation.updated_at,
        decision=_decision_context(case),
    )


def _to_summary(contestation: Contestation) -> ContestationSummarySchema:
    return ContestationSummarySchema(
        id=contestation.id,
        application_number=contestation.case.application_number,
        citizen_name=_citizen_name(contestation.case),
        reason=contestation.reason,
        reason_label=REASON_LABELS[contestation.reason],
        status=contestation.status,
        reviewed_by=contestation.reviewed_by,
        created_at=contestation.created_at,
        updated_at=contestation.updated_at,
    )


def _agent_display_name(agent: User) -> str:
    """The reviewing agent's name — parity with ``agent.service._agent_display_name``."""
    full_name = f"{agent.first_name} {agent.last_name}".strip()
    return full_name or agent.email


# ---------------------------------------------------------------------------
# Commands & queries
# ---------------------------------------------------------------------------


def create_contestation(
    db: Session,
    *,
    user: User,
    application_number: str,
    reason: ContestationReason,
    description: str,
) -> ContestationSchema:
    """Open a challenge to a dossier's decision. Backs ``POST /contestations``.

    Refuses, in order: an unknown dossier (404); a dossier the caller does not
    own (403 — a citizen may only contest *their* decision); a dossier with no
    recorded decision to contest (400); and a dossier that already has an open
    contestation (400 — one challenge in flight at a time).
    """
    case = repository.get_case_by_application_number(db, application_number)
    if case is None:
        raise NotFoundError(
            f"Aucun dossier ne correspond à la référence « {application_number} »."
        )

    # Ownership: the case's applicant must be this account. The link is the
    # citizens.user_id FK, never the e-mail — identity comes from the token.
    if case.citizen is None or case.citizen.user_id != user.id:
        raise ForbiddenError(
            "Vous ne pouvez contester qu’une décision portant sur votre propre dossier."
        )

    if case.decision is None or case.status not in DECIDED_STATUSES:
        raise ValidationError(
            "Ce dossier n’a pas encore fait l’objet d’une décision : il n’y a rien à "
            "contester. La contestation n’est ouverte qu’après une décision de l’agent."
        )

    if repository.find_open_for_dossier(db, case.id) is not None:
        raise ValidationError(
            "Une contestation est déjà en cours d’examen pour ce dossier. Attendez sa "
            "résolution avant d’en déposer une nouvelle."
        )

    contestation = Contestation(
        dossier_id=case.id,
        citizen_id=case.citizen.id,
        original_decision_id=case.decision.id,
        reason=reason,
        description=description,
        status=ContestationStatus.PENDING,
    )

    # Trace the challenge into the same transaction as its creation. The payload
    # records the category and the decision contested — never the free-text
    # description, which is the citizen's own words about their case.
    audit_service.record(
        db,
        action=AuditAction.contestation_created,
        entity_type="case",
        entity_id=case.application_number,
        actor=user,
        summary=(
            f"Contestation déposée sur le dossier {case.application_number} "
            f"(motif : {REASON_LABELS[reason]})."
        ),
        payload={
            "reason": reason.value,
            "contested_outcome": case.decision.outcome.value,
            "original_decision_id": case.decision.id,
        },
    )

    saved = repository.save(db, contestation)

    # The challenge is now open — tell the agents. Best-effort, like the
    # submission and decision emitters: never rolls back the committed contestation.
    notifications_service.emit_contestation_filed(
        db, application_number=case.application_number
    )

    return _to_schema(saved)


def list_my_contestations(db: Session, *, user: User) -> list[ContestationSchema]:
    """This citizen's contestations. Backs ``GET /contestations/my``.

    Scoped to the caller's own applicant row: a citizen with no applicant record
    has filed none, so the list is empty rather than an error.
    """
    from app.modules.citizen.profile import resolve_citizen

    citizen = resolve_citizen(db, user)
    db.commit()  # persist the row if resolve_citizen just created/adopted it
    rows = repository.list_for_citizen(db, citizen.id)
    return [_to_schema(row) for row in rows]


def list_contestations(
    db: Session, *, status: ContestationStatus | None = None
) -> list[ContestationSummarySchema]:
    """The agent review queue. Backs ``GET /contestations``."""
    rows = repository.list_all(db, status=status)
    return [_to_summary(row) for row in rows]


def get_contestation(db: Session, contestation_id: str) -> ContestationSchema:
    """One contestation in full (agent). Backs ``GET /contestations/{id}``."""
    contestation = repository.get_by_id(db, contestation_id)
    if contestation is None:
        raise NotFoundError("Cette contestation est introuvable.")
    return _to_schema(contestation)


def start_review(
    db: Session, contestation_id: str, *, agent: User
) -> ContestationSchema:
    """Take a contestation into review. Backs ``PATCH /contestations/{id}/review``.

    PENDING → UNDER_REVIEW. Stamps the reviewing agent and records the transition.
    """
    contestation = repository.get_by_id(db, contestation_id)
    if contestation is None:
        raise NotFoundError("Cette contestation est introuvable.")

    _ensure_transition(contestation.status, ContestationStatus.UNDER_REVIEW)

    contestation.status = ContestationStatus.UNDER_REVIEW
    contestation.reviewed_by = _agent_display_name(agent)

    audit_service.record(
        db,
        action=AuditAction.contestation_review_started,
        entity_type="case",
        entity_id=contestation.case.application_number,
        actor=agent,
        summary=(
            f"Contestation du dossier {contestation.case.application_number} prise en "
            f"examen par {contestation.reviewed_by}."
        ),
        payload={"contestation_id": contestation.id},
    )

    saved = repository.save(db, contestation)
    return _to_schema(saved)


def resolve_contestation(
    db: Session,
    contestation_id: str,
    *,
    agent: User,
    accept: bool,
    resolution_comment: str,
) -> ContestationSchema:
    """Resolve a contestation. Backs ``PATCH /contestations/{id}/resolve``.

    (PENDING | UNDER_REVIEW) → ACCEPTED | REJECTED. The agent's reasoning is
    mandatory and stamped on the record; the transition is audited and the
    citizen is notified. The AI does not decide here — the agent does.
    """
    contestation = repository.get_by_id(db, contestation_id)
    if contestation is None:
        raise NotFoundError("Cette contestation est introuvable.")

    target = ContestationStatus.ACCEPTED if accept else ContestationStatus.REJECTED
    _ensure_transition(contestation.status, target)

    comment = resolution_comment.strip()
    if not comment:
        raise ValidationError(
            "La résolution d’une contestation doit être motivée : indiquez le motif "
            "de l’acceptation ou du rejet."
        )

    contestation.status = target
    contestation.reviewed_by = _agent_display_name(agent)
    contestation.resolution_comment = comment

    audit_service.record(
        db,
        action=AuditAction.contestation_resolved,
        entity_type="case",
        entity_id=contestation.case.application_number,
        actor=agent,
        summary=(
            f"Contestation du dossier {contestation.case.application_number} "
            f"{target.value} par {contestation.reviewed_by}."
        ),
        payload={
            "contestation_id": contestation.id,
            "resolution": target.value,
        },
    )

    saved = repository.save(db, contestation)

    notifications_service.emit_contestation_resolved(
        db,
        citizen_user_id=contestation.case.citizen.user_id,
        accepted=accept,
        application_number=contestation.case.application_number,
    )

    return _to_schema(saved)
