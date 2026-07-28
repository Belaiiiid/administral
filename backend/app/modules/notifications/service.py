"""Notification creation, reading, and the two domain-event emitters.

The read side (list / count / mark-read) is scoped to the caller: every query
filters on ``user_id``, so the endpoint cannot return another account's rows —
the guard against one role seeing another's messages is the ``WHERE``, not a
role check.

The write side is two emitters called from the domain flows: `emit_dossier_submitted`
from the citizen→agent submission bridge, and `emit_decision` from the agent's
decision. Both are **best-effort**: a notification is a side effect of a business
action that has already committed, so a failure to write one is logged and
swallowed rather than allowed to roll back — or appear to fail — the submission
or the decision the citizen and agent actually care about.
"""

from __future__ import annotations

import logging

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.email import Email, send_email
from app.modules.agent.models import Case
from app.modules.agent.models import CaseDecision as CaseDecisionModel
from app.modules.agent.schemas import DecisionEvidenceSchema
from app.modules.ai.explanation import generate_verified_decision_reason
from app.modules.auth import repository as auth_repository
from app.modules.auth.models import Role, User
from app.modules.notifications.models import (
    DecisionEmailLog,
    EmailDeliveryStatus,
    Notification,
    NotificationType,
)
from app.modules.settings import service as settings_service

logger = logging.getLogger(__name__)


class NotFoundError(Exception):
    """A notification id that is not this user's (or does not exist)."""


# ---------------------------------------------------------------------------
# Read side — always scoped to the authenticated user.
# ---------------------------------------------------------------------------


def list_for_user(db: Session, user: User, *, limit: int = 100) -> list[Notification]:
    """This user's notifications, newest first."""
    stmt = (
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


def unread_count(db: Session, user: User) -> int:
    stmt = select(func.count()).where(
        Notification.user_id == user.id, Notification.read.is_(False)
    )
    return int(db.execute(stmt).scalar_one())


def mark_read(db: Session, user: User, notification_id: int) -> Notification:
    """Mark one notification read. Refuses an id that is not this user's."""
    notification = db.execute(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user.id
        )
    ).scalar_one_or_none()

    if notification is None:
        # Same response whether the row belongs to someone else or does not
        # exist: never confirm the existence of another user's notification.
        raise NotFoundError("Cette notification est introuvable.")

    if not notification.read:
        notification.read = True
        notification.read_at = func.now()
        db.commit()
        db.refresh(notification)
    return notification


def mark_all_read(db: Session, user: User) -> int:
    """Mark every unread notification of this user read. Returns how many."""
    result = db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read.is_(False))
        .values(read=True, read_at=func.now())
    )
    db.commit()
    return int(result.rowcount or 0)


# ---------------------------------------------------------------------------
# Write side — domain-event emitters, best-effort.
# ---------------------------------------------------------------------------


def _create(
    db: Session,
    *,
    user_id: int,
    type_: NotificationType,
    title: str,
    body: str,
    reference: str | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id, type=type_, title=title, body=body, reference=reference
    )
    db.add(notification)
    return notification


def emit_dossier_submitted(db: Session, *, application_number: str) -> None:
    """Tell the agents a new dossier has landed in the queue.

    Fan-out to every agent/admin because the queue is shared — there is no
    per-case assignment in the model, so "a new dossier to instruct" is news to
    all of them. Best-effort: never breaks the submission that triggered it.
    """
    try:
        staff = auth_repository.list_by_roles(db, [Role.AGENT, Role.ADMIN])
        for agent in staff:
            _create(
                db,
                user_id=agent.id,
                type_=NotificationType.dossier_submitted,
                title="Nouveau dossier à instruire",
                body=f"Le dossier {application_number} a été soumis et attend son instruction.",
                reference=application_number,
            )
        db.commit()
    except Exception:  # noqa: BLE001 — a notification must never break submission
        logger.exception("Failed to emit dossier_submitted notifications for %s", application_number)
        db.rollback()


def emit_contestation_filed(db: Session, *, application_number: str) -> None:
    """Tell the agents a citizen has contested a decision.

    Fan-out to every agent/admin, like `emit_dossier_submitted`: the review
    queue is shared. Best-effort — never breaks the contestation it follows.
    """
    try:
        staff = auth_repository.list_by_roles(db, [Role.AGENT, Role.ADMIN])
        for agent in staff:
            _create(
                db,
                user_id=agent.id,
                type_=NotificationType.contestation_filed,
                title="Contestation d’une décision",
                body=(
                    f"Une décision sur le dossier {application_number} a été contestée "
                    "et attend un réexamen."
                ),
                reference=application_number,
            )
        db.commit()
    except Exception:  # noqa: BLE001 — a notification must never break the contestation
        logger.exception(
            "Failed to emit contestation_filed notifications for %s", application_number
        )
        db.rollback()


def emit_contestation_resolved(
    db: Session,
    *,
    citizen_user_id: int | None,
    accepted: bool,
    application_number: str,
) -> None:
    """Tell the citizen how their contestation was resolved.

    ``citizen_user_id`` may be ``None`` for a legacy applicant with no account —
    a no-op then, not an error. Best-effort, like the decision emitter; also
    sends an opt-in e-mail copy once the in-app notification is committed.
    """
    if citizen_user_id is None:
        return
    try:
        if accepted:
            title = "Votre contestation a été acceptée"
            body = (
                f"Votre contestation concernant le dossier {application_number} a été "
                "acceptée. Consultez le détail pour connaître les suites."
            )
        else:
            title = "Votre contestation a été rejetée"
            body = (
                f"Votre contestation concernant le dossier {application_number} a été "
                "examinée puis rejetée. Le motif est indiqué dans le détail."
            )

        _create(
            db,
            user_id=citizen_user_id,
            type_=NotificationType.contestation_resolved,
            title=title,
            body=body,
            reference=application_number,
        )
        db.commit()

        if settings_service.wants_email(db, citizen_user_id):
            recipient = auth_repository.get_by_id(db, citizen_user_id)
            if recipient is not None:
                send_email(Email(to=recipient.email, subject=title, body=body))
    except Exception:  # noqa: BLE001 — a notification must never break the resolution
        logger.exception(
            "Failed to emit contestation_resolved notification for %s", application_number
        )
        db.rollback()


def emit_decision(
    db: Session,
    *,
    citizen_user_id: int | None,
    validated: bool,
    application_number: str,
) -> None:
    """Tell the citizen their dossier was decided.

    ``citizen_user_id`` may be ``None`` for a legacy case whose applicant row was
    never linked to an account — there is simply no one to notify, so it is a
    no-op rather than an error. Best-effort, like the submission emitter.
    """
    if citizen_user_id is None:
        return
    try:
        if validated:
            title = "Votre dossier a été validé"
            body = (
                f"Bonne nouvelle : votre dossier {application_number} a été validé "
                "par un agent instructeur."
            )
            type_ = NotificationType.dossier_validated
        else:
            title = "Votre dossier a été rejeté"
            body = (
                f"Votre dossier {application_number} a été rejeté. Consultez le détail "
                "pour connaître le motif et les suites possibles."
            )
            type_ = NotificationType.dossier_rejected

        _create(
            db,
            user_id=citizen_user_id,
            type_=type_,
            title=title,
            body=body,
            reference=application_number,
        )
        db.commit()

        # No e-mail copy here (unlike `emit_contestation_resolved`): the decision
        # e-mail is not an opt-in convenience copy of this in-app notice, it is
        # the authoritative, LLM-justified decision letter — see
        # `send_decision_email`, called separately from `agent.service.decide_case`
        # right after this function, with its own delivery log. Sending both would
        # mean two conflicting messages about the same decision.
    except Exception:  # noqa: BLE001 — a notification must never break the decision
        logger.exception("Failed to emit decision notification for %s", application_number)
        db.rollback()


def send_decision_email(
    db: Session,
    *,
    case: Case,
    decision: CaseDecisionModel,
    evidence: list[DecisionEvidenceSchema],
) -> str | None:
    """The automatic decision e-mail: reference, decision, date, and an
    LLM-generated reason verified against the dossier (see
    `ai.explanation.generate_verified_decision_reason`).

    Unlike `emit_decision`'s in-app copy, this is not gated by the citizen's
    notification preference: it is the formal notice of a decision about their
    own dossier, not a discretionary convenience alert. Every attempt — sent or
    failed — is logged to `DecisionEmailLog`, per the delivery contract this
    feature is built to.

    Called *after* `decide_case` has already committed the decision (its
    caller's contract, not this function's — see `agent.service.decide_case`):
    a failure here can safely be turned into a log row and a returned status
    without any risk of leaving the decision itself unsaved. Never raises.

    Returns ``"sent"``, ``"failed"``, or ``None`` when there is no linked
    citizen account to write to (nothing was attempted).
    """
    citizen_user_id = case.citizen.user_id
    if citizen_user_id is None:
        return None

    recipient = auth_repository.get_by_id(db, citizen_user_id)
    if recipient is None:
        return None

    reason = generate_verified_decision_reason(case, decision.outcome, evidence)

    decision_label = "Validé" if decision.outcome.value == "validated" else "Rejeté"
    decision_date = decision.created_at.strftime("%d/%m/%Y")

    subject = f"Décision concernant votre dossier {case.application_number}"
    body = (
        f"Référence du dossier : {case.application_number}\n"
        f"Décision : {decision_label}\n"
        f"Date de la décision : {decision_date}\n\n"
        f"Motif : {reason}\n"
    )

    status = EmailDeliveryStatus.sent
    error: str | None = None
    try:
        send_email(Email(to=recipient.email, subject=subject, body=body))
    except Exception as erreur:  # noqa: BLE001 — delivery failure must not break the decision
        status = EmailDeliveryStatus.failed
        error = str(erreur)
        logger.exception(
            "Failed to send decision e-mail for %s", case.application_number
        )

    try:
        db.add(
            DecisionEmailLog(
                application_id=case.id,
                citizen_id=case.citizen_id,
                status=status,
                generated_reason=reason,
                delivery_error=error,
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001 — logging the attempt must never break the decision
        logger.exception(
            "Failed to record decision e-mail log for %s", case.application_number
        )
        db.rollback()

    return status.value
