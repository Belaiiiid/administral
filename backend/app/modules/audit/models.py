"""The audit event — an append-only, tamper-evident record.

One row is one thing that happened to a dossier or a profile: who did it, when,
to what, and a structured payload describing it. The table is **append-only by
contract** — nothing in the application ever updates or deletes a row — and each
row carries the SHA-256 hash of its own content chained onto the hash of the
previous row (``previous_hash`` → ``event_hash``). Altering or removing any past
entry therefore breaks every hash from that point on, which ``service.verify_chain``
detects. That is what makes the trail *immutable in effect*, not merely by
convention.

Deliberately **not** a ``TimestampMixin``: an ``updated_at`` on an append-only
log would be a contradiction, and ``occurred_at`` is the one time that matters —
when the audited action happened, set by the writer, not a row-write default.

Privacy: the payload records *what changed*, never sensitive values. A profile
edit logs the field names touched, never the NIR or the birth date themselves —
the audit trail must be safe to read widely without becoming a second copy of
the data it guards.
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

#: The genesis link — the ``previous_hash`` of the very first event, so even the
#: first row is chained to a fixed, known value rather than to nothing.
GENESIS_HASH = "0" * 64


class AuditAction(str, enum.Enum):
    """The kind of event, named after the business act it records.

    New actions are added here as more flows become audited; the string values
    are stable identifiers written into every hashed record, so they must never
    be renamed once emitted (that would rewrite history's meaning).
    """

    #: A citizen submitted a dossier — a `Case` entered the agent queue.
    dossier_submitted = "dossier_submitted"
    #: An agent recorded a decision (validation or rejection) on a dossier.
    decision_recorded = "decision_recorded"
    #: A citizen edited their living profile.
    profile_updated = "profile_updated"
    #: A citizen contested a decision (opened a challenge — droit de contestation).
    contestation_created = "contestation_created"
    #: An agent took a contestation into review (PENDING → UNDER_REVIEW).
    contestation_review_started = "contestation_review_started"
    #: An agent resolved a contestation (accepted or rejected the challenge).
    contestation_resolved = "contestation_resolved"
    #: A personalised checklist was first generated for a dossier from its profile.
    checklist_generated = "checklist_generated"
    #: A dossier's personalised checklist changed because the profile changed.
    checklist_updated = "checklist_updated"
    #: The unified MonParcours Result was first computed for a dossier.
    assessment_generated = "assessment_generated"
    #: The MonParcours Result changed because its inputs (reports/documents) changed.
    assessment_updated = "assessment_updated"


class AuditEvent(Base):
    """A single, immutable entry in the audit trail."""

    __tablename__ = "audit_events"
    __table_args__ = (
        # The common read is "the trail for this dossier / this profile".
        Index("ix_audit_events_entity", "entity_type", "entity_id"),
    )

    #: Autoincrement PK doubles as the chain sequence: the ordering the hash
    #: chain is verified in is ``ORDER BY id``.
    id: Mapped[int] = mapped_column(primary_key=True)

    #: When the audited action happened, set by the writer (not a DB default).
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    #: Who acted. Nullable + ``SET NULL``: the trail must outlive the account, so
    #: deleting a user does not erase — or cascade-delete — their history.
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    #: The actor's role *at the time*, snapshotted as a plain string so a later
    #: role change never rewrites what a past entry says. ``"system"`` for events
    #: with no human actor.
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False)

    action: Mapped[AuditAction] = mapped_column(
        SAEnum(AuditAction, name="audit_action"), nullable=False
    )
    #: What the event is about, e.g. ``"case"`` or ``"citizen"``.
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    #: The business identifier of that thing (an application number, a citizen id).
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)

    #: Human-readable one-line description, shown in the trail view.
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    #: Structured, non-sensitive detail. Field *names* changed, counts, outcomes —
    #: never the protected values themselves.
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    #: The ``event_hash`` of the previous row (or ``GENESIS_HASH`` for the first).
    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    #: SHA-256 over this row's content *and* ``previous_hash`` — see service.
    event_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AuditEvent id={self.id} {self.action.value} {self.entity_type}:{self.entity_id}>"
