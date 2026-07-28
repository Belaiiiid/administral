"""The contestation entity — a citizen's challenge to a decision.

One row is one citizen's formal disagreement with the agent's ruling on one
dossier, and the agent's answer to it. It is a normal mutable record (unlike an
`AuditEvent`): its ``status`` moves through a small state machine as the
challenge is reviewed and resolved. What makes the *history* tamper-evident is
not this row but the audit events written alongside each transition — this table
holds the current state, the trail holds how it got there.

Relationships and their delete rules
------------------------------------
- ``dossier_id`` → ``cases`` (**CASCADE**): a contestation has no meaning
  without the dossier it contests, so purging the case takes it along.
- ``citizen_id`` → ``citizens`` (**CASCADE**): likewise for the applicant.
- ``original_decision_id`` → ``case_decisions`` (**SET NULL**, nullable): a
  decision can be *replaced* when an agent re-decides (see
  ``agent.repository.save_decision``, which deletes the old row). SET NULL means
  a re-decision never cascades away — or is blocked by — an existing
  contestation; the challenge survives, and the dossier's current decision is
  read for context instead. The immutable link to what was contested lives in
  the ``contestation_created`` audit event, not in this FK.
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin
from app.modules.agent.models import Case, CaseDecision, Citizen


def _uuid() -> str:
    return str(uuid.uuid4())


class ContestationStatus(str, enum.Enum):
    """Where a challenge stands. A small, strictly-ordered state machine.

    ``PENDING`` → ``UNDER_REVIEW`` → (``ACCEPTED`` | ``REJECTED``). A resolution
    may also be reached directly from ``PENDING``. The two outcomes are terminal.
    The allowed transitions are enforced in the service, not here.
    """

    PENDING = "PENDING"
    UNDER_REVIEW = "UNDER_REVIEW"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


class ContestationReason(str, enum.Enum):
    """Why the citizen contests — a fixed category for triage and analytics.

    A constrained set rather than free text so an agent can filter the queue and
    the audit payload can carry a stable, non-sensitive label. The citizen's own
    words go in ``description``; this is the heading above them.
    """

    erreur_appreciation = "erreur_appreciation"
    piece_non_prise_en_compte = "piece_non_prise_en_compte"
    erreur_calcul = "erreur_calcul"
    changement_situation = "changement_situation"
    autre = "autre"


#: Human-readable French labels, served to both portals so the label rule lives
#: on the server and cannot drift between the citizen and agent UIs.
REASON_LABELS: dict[ContestationReason, str] = {
    ContestationReason.erreur_appreciation: "Erreur d’appréciation du dossier",
    ContestationReason.piece_non_prise_en_compte: "Pièce justificative non prise en compte",
    ContestationReason.erreur_calcul: "Erreur de calcul du droit",
    ContestationReason.changement_situation: "Changement de situation",
    ContestationReason.autre: "Autre motif",
}


class Contestation(TimestampMixin, Base):
    """A citizen's challenge to a decision, and its resolution."""

    __tablename__ = "contestations"
    __table_args__ = (
        # The agent queue lists by status; the citizen reads their own by dossier.
        Index("ix_contestations_status", "status"),
        Index("ix_contestations_dossier_id", "dossier_id"),
        Index("ix_contestations_citizen_id", "citizen_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)

    dossier_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    citizen_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("citizens.id", ondelete="CASCADE"), nullable=False
    )
    #: The decision being contested. SET NULL (see module docstring): a
    #: re-decision must not cascade this away.
    original_decision_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("case_decisions.id", ondelete="SET NULL"), nullable=True
    )

    reason: Mapped[ContestationReason] = mapped_column(
        SAEnum(ContestationReason, name="contestation_reason"), nullable=False
    )
    #: The citizen's explanation in their own words — the substance of the challenge.
    description: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[ContestationStatus] = mapped_column(
        SAEnum(ContestationStatus, name="contestation_status"),
        nullable=False,
        default=ContestationStatus.PENDING,
    )
    #: Display name of the reviewing agent — the "décision humaine" parity of
    #: ``CaseDecision.decided_by``. Null until an agent picks the challenge up.
    reviewed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    #: The agent's reasoning for accepting or rejecting the challenge. Null until
    #: resolved; required (non-empty) at resolution — a human answer must be given.
    resolution_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Read-only convenience relationships (no back-populated collection on the
    # agent models, so this module adds nothing to the Case aggregate).
    case: Mapped[Case] = relationship(Case, lazy="joined")
    citizen: Mapped[Citizen] = relationship(Citizen, lazy="joined")
    original_decision: Mapped[CaseDecision | None] = relationship(CaseDecision)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Contestation id={self.id} dossier={self.dossier_id} {self.status.value}>"
