"""SQLAlchemy entities for the Case aggregate.

Mirrors the domain model the frontend already declares in
``frontend/src/types/case.ts``. That file was written as the backend contract
before any backend existed, so it is the specification here rather than an
afterthought: every table below corresponds to an interface in it.

Placed in the agent module rather than a shared ``models`` package because the
agent portal is what reads and writes cases. If the citizen module later needs
its own view of an application, it gets its own entities; a single god-module
of entities is the arrangement this layout exists to avoid.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Enums — each mirrors a string union in types/case.ts
# ---------------------------------------------------------------------------


class CaseStatus(str, enum.Enum):
    submitted = "submitted"
    awaiting_documents = "awaiting_documents"
    under_review = "under_review"
    ready_for_decision = "ready_for_decision"
    validated = "validated"
    rejected = "rejected"


class CaseScoreBand(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"


class ReportOutcome(str, enum.Enum):
    passed = "passed"
    warning = "warning"
    failed = "failed"


class AnomalySeverity(str, enum.Enum):
    info = "info"
    warning = "warning"
    error = "error"


class DocumentStatus(str, enum.Enum):
    uploading = "uploading"
    analysing = "analysing"
    validated = "validated"
    rejected = "rejected"


class MaritalStatus(str, enum.Enum):
    single = "single"
    married = "married"
    pacs = "pacs"
    cohabiting = "cohabiting"


class OccupancyStatus(str, enum.Enum):
    tenant = "tenant"
    owner = "owner"
    hosted = "hosted"


class DecisionOutcome(str, enum.Enum):
    validated = "validated"
    rejected = "rejected"


# ``ReportOutcome`` backs two tables. The PostgreSQL type is declared once here
# and shared, so both columns reference the same ``report_outcome`` type rather
# than each trying to CREATE TYPE and the second failing.
report_outcome_type = SAEnum(ReportOutcome, name="report_outcome")


# ---------------------------------------------------------------------------
# Citizen
# ---------------------------------------------------------------------------


class Citizen(TimestampMixin, Base):
    """The applicant record.

    ``social_security_number`` holds the full NIR. It is never serialised: the
    API returns a masked form, produced in ``core.security``. Storing it whole
    and masking on the way out means the masking rule lives in one place and
    cannot be forgotten by a new endpoint.
    """

    __tablename__ = "citizens"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    social_security_number: Mapped[str] = mapped_column(String(32), nullable=False)

    cases: Mapped[list[Case]] = relationship(back_populates="citizen")


# ---------------------------------------------------------------------------
# Case aggregate
# ---------------------------------------------------------------------------


class Case(TimestampMixin, Base):
    """A citizen application after the processing pipeline has run.

    The score and the household/housing snapshot are columns rather than joined
    tables: both are strictly 1:1 with the case and always read together, so a
    join would buy nothing. The snapshot is deliberately a *copy* of the
    citizen's situation frozen at submission — it must not follow later profile
    edits, which is exactly why it is not a foreign key.
    """

    __tablename__ = "cases"
    __table_args__ = (
        # The instruction queue filters on status and orders by submission date.
        Index("ix_cases_status_submitted_at", "status", "submitted_at"),
        Index("ix_cases_citizen_id", "citizen_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    application_number: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    status: Mapped[CaseStatus] = mapped_column(
        SAEnum(CaseStatus, name="case_status"), nullable=False
    )
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    citizen_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("citizens.id", ondelete="RESTRICT"), nullable=False
    )
    citizen: Mapped[Citizen] = relationship(back_populates="cases")

    # Targeted service. Denormalised: `service_id` is the administration
    # ('caf', 'france-travail', …), `service_label` the public-facing name.
    service_id: Mapped[str] = mapped_column(String(64), nullable=False)
    service_label: Mapped[str] = mapped_column(String(255), nullable=False)

    # Eligibility score — null until the scoring stage has run.
    score_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_band: Mapped[CaseScoreBand | None] = mapped_column(
        SAEnum(CaseScoreBand, name="case_score_band"), nullable=True
    )
    score_computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    score_model: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Profile snapshot, frozen at submission.
    marital_status: Mapped[MaritalStatus] = mapped_column(
        SAEnum(MaritalStatus, name="marital_status"), nullable=False
    )
    dependent_children: Mapped[int] = mapped_column(Integer, nullable=False)
    attached_adults: Mapped[int] = mapped_column(Integer, nullable=False)
    occupancy_status: Mapped[OccupancyStatus] = mapped_column(
        SAEnum(OccupancyStatus, name="occupancy_status"), nullable=False
    )
    living_area_sqm: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_rent_excluding_charges: Mapped[int] = mapped_column(Integer, nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(16), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    annual_income: Mapped[int] = mapped_column(Integer, nullable=False)
    profile_captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    documents: Mapped[list[CaseDocument]] = relationship(
        back_populates="case", cascade="all, delete-orphan"
    )
    completeness_report: Mapped[CompletenessReport | None] = relationship(
        back_populates="case", cascade="all, delete-orphan", uselist=False
    )
    coherence_report: Mapped[CoherenceReport | None] = relationship(
        back_populates="case", cascade="all, delete-orphan", uselist=False
    )
    decision: Mapped[CaseDecision | None] = relationship(
        back_populates="case", cascade="all, delete-orphan", uselist=False
    )


class CaseDocument(TimestampMixin, Base):
    """A supporting file attached to a case."""

    __tablename__ = "case_documents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    case: Mapped[Case] = relationship(back_populates="documents")

    #: Which checklist requirement this file satisfies, e.g. ``proof_of_address``.
    requirement_id: Mapped[str] = mapped_column(String(64), nullable=False)
    requirement_label: Mapped[str] = mapped_column(String(255), nullable=False)

    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(
        SAEnum(DocumentStatus, name="document_status"), nullable=False
    )
    #: Set when status is ``rejected``.
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Set once the extraction stage has read the file.
    extracted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    #: Agent C4 metadata forensics, computed by the pipeline before the agent
    #: sees the case (like the completeness and coherence reports). `fraud_analysis`
    #: holds the whole result; `fraud_risk` lifts out the level for a quick badge.
    #: The Agent Portal consumes these — it never recomputes them.
    fraud_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    fraud_risk: Mapped[str | None] = mapped_column(String(32), nullable=True)


# ---------------------------------------------------------------------------
# Pipeline reports
# ---------------------------------------------------------------------------


class CompletenessReport(TimestampMixin, Base):
    """Result of "are all required documents present?"."""

    __tablename__ = "completeness_reports"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    case: Mapped[Case] = relationship(back_populates="completeness_report")

    outcome: Mapped[ReportOutcome] = mapped_column(report_outcome_type, nullable=False)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: 0–100, computed by the pipeline — never recomputed by a client.
    completion_rate: Mapped[int] = mapped_column(Integer, nullable=False)

    items: Mapped[list[CompletenessItem]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )


class CompletenessItem(Base):
    """One line of the "pièces attendues" checklist."""

    __tablename__ = "completeness_items"
    __table_args__ = (UniqueConstraint("report_id", "item_key", name="uq_completeness_item_key"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    report_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("completeness_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    report: Mapped[CompletenessReport] = relationship(back_populates="items")

    #: Requirement key, e.g. ``rib``. Unique per report, not globally.
    item_key: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    received: Mapped[bool] = mapped_column(Boolean, nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False)


class CoherenceReport(TimestampMixin, Base):
    """Result of "do the declared data and the documents agree?"."""

    __tablename__ = "coherence_reports"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    case: Mapped[Case] = relationship(back_populates="coherence_report")

    outcome: Mapped[ReportOutcome] = mapped_column(report_outcome_type, nullable=False)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    anomalies: Mapped[list[CoherenceAnomaly]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )


class CoherenceAnomaly(Base):
    """A disagreement between declared data and a document."""

    __tablename__ = "coherence_anomalies"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    report_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("coherence_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    report: Mapped[CoherenceReport] = relationship(back_populates="anomalies")

    severity: Mapped[AnomalySeverity] = mapped_column(
        SAEnum(AnomalySeverity, name="anomaly_severity"), nullable=False
    )
    #: Human-readable field name in conflict, e.g. « Loyer mensuel ».
    field: Mapped[str] = mapped_column(String(255), nullable=False)
    declared_value: Mapped[str] = mapped_column(String(255), nullable=False)
    observed_value: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)


# ---------------------------------------------------------------------------
# Decision
# ---------------------------------------------------------------------------


class CaseDecision(Base):
    """An agent's formal decision on a case.

    ``evidence_used`` is a table, not a JSON column, because it is the audit
    trail: every sentence shown to a citizen must be traceable to a row here.
    Queryable evidence is the point — "which decisions cited a missing RIB?"
    has to be answerable.
    """

    __tablename__ = "case_decisions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    case: Mapped[Case] = relationship(back_populates="decision")

    outcome: Mapped[DecisionOutcome] = mapped_column(
        SAEnum(DecisionOutcome, name="decision_outcome"), nullable=False
    )
    #: Citizen-facing message, composed exclusively from the evidence below.
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    #: Display name of the deciding agent. Becomes a real FK when auth lands.
    decided_by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    evidence_used: Mapped[list[DecisionEvidence]] = relationship(
        back_populates="decision", cascade="all, delete-orphan"
    )


class DecisionEvidence(Base):
    """A single verifiable fact drawn from the case, cited by a decision."""

    __tablename__ = "decision_evidence"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    decision_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("case_decisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    decision: Mapped[CaseDecision] = relationship(back_populates="evidence_used")

    #: Which part of the case this fact came from, e.g. ``documents``.
    field: Mapped[str] = mapped_column(String(120), nullable=False)
    #: The fact itself, already phrased for a citizen.
    value: Mapped[str] = mapped_column(Text, nullable=False)
    #: Pointer into the Case, for audit — e.g. ``Case.completenessReport.items[rib]``.
    source: Mapped[str] = mapped_column(String(255), nullable=False)
