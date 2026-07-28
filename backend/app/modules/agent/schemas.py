"""Pydantic response schemas for the agent module.

These are the wire contract. They mirror ``frontend/src/types/case.ts`` field
for field, including its **camelCase** naming — the frontend consumes these
objects directly, and renaming keys at the boundary would mean either editing
every component or writing a translation layer nobody asked for.

The Python attributes stay snake_case, as Python should be; ``alias_generator``
does the conversion on serialisation only.

Note what is absent: no ``social_security_number``. The full NIR exists in
PostgreSQL and has no field here to travel in.
"""

from __future__ import annotations

import enum
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.modules.ai.fraud.schemas import FraudAnalysisSchema
from app.modules.agent.models import (
    AnomalySeverity,
    CaseScoreBand,
    CaseStatus,
    DecisionOutcome,
    DocumentStatus,
    MaritalStatus,
    OccupancyStatus,
    ReportOutcome,
)


class CamelModel(BaseModel):
    """Serialises snake_case attributes as camelCase JSON."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class CaseCitizenSchema(CamelModel):
    """Applicant identity as denormalised onto the case.

    ``masked_social_security_number`` is computed in the service from the stored
    NIR. There is deliberately no field carrying the unmasked value.
    """

    id: str
    first_name: str
    last_name: str
    email: str
    #: Nullable on `Citizen` — unknown until the citizen declares it.
    birth_date: date | None = None
    masked_social_security_number: str


class CaseServiceSchema(CamelModel):
    id: str
    label: str


class CaseScoreSchema(CamelModel):
    """AI eligibility score, produced before the case reaches the portal.

    ``band`` is supplied by the backend rather than derived from ``value`` by
    the client: the thresholds are a business rule, and an agent screen must
    never be the second place they are written down.
    """

    value: int
    band: CaseScoreBand
    computed_at: datetime
    model: str

    # ``model_`` is a reserved namespace in Pydantic v2; the field is named
    # ``model`` by the contract, so the protection is disabled for this schema
    # rather than the field being renamed.
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        protected_namespaces=(),
    )


class CaseSummarySchema(CamelModel):
    """Row projection for the instruction queue — ``GET /agent/cases``.

    Six fields plus the applicant. A list endpoint must not ship every document
    of every case to render a table.
    """

    id: str
    application_number: str
    citizen: CaseCitizenSchema
    submitted_at: datetime
    service: CaseServiceSchema
    score: CaseScoreSchema | None = None
    status: CaseStatus
    #: Days elapsed since submission. Computed server-side, never in the UI.
    waiting_days: int


class CaseSortField(str, enum.Enum):
    """Columns the CAF instructor list — ``GET /agent/cases/list`` — may sort by.

    A closed set exposed on the wire, mirrored 1:1 by
    ``agent.repository.SORTABLE_COLUMNS``: a client can request only a sort the
    server already knows how to translate into SQL.
    """

    submitted_at = "submittedAt"
    application_number = "applicationNumber"
    status = "status"
    score_value = "scoreValue"
    completion_rate = "completionRate"
    coherence_score = "coherenceScore"


class SortDirection(str, enum.Enum):
    asc = "asc"
    desc = "desc"


class CaseListItemSchema(CaseSummarySchema):
    """Row projection for the CAF instructor list — ``GET /agent/cases/list``.

    Extends the instruction-queue summary with the three read-only signals an
    instructor scans a list for. None of the three is computed here: each is
    read exactly as an earlier pipeline stage wrote it, and is ``None`` when
    that stage has not run — never a recalculated substitute.
    """

    #: 0–100, from the completeness stage; ``None`` until it has run.
    completion_rate: int | None = None
    #: From the coherence stage; ``None`` until it has run.
    coherence_status: ReportOutcome | None = None
    #: The worst ``fraud_risk`` among the case's documents; ``None`` when no
    #: document has been analysed for fraud yet.
    fraud_status: str | None = None


class CaseListPageSchema(CamelModel):
    """One page of the CAF instructor list, plus enough to render pagination.

    ``total`` is the filtered row count across every page, not this page's
    length — the client needs it to compute the number of pages without a
    second request.
    """

    items: list[CaseListItemSchema]
    total: int
    page: int
    page_size: int


class CaseQueueStatsSchema(CamelModel):
    """Dashboard workload counters — ``GET /agent/cases/stats``.

    Aggregated server-side and returned whole. The UI must not count rows
    itself: the queue endpoint is filtered and will be paginated, so a
    client-side tally would report the size of the current page rather than the
    size of the workload.
    """

    pending: int
    to_review_today: int
    citizens_tracked: int


# ---------------------------------------------------------------------------
# Full case detail — GET /agent/cases/{case_id}
# ---------------------------------------------------------------------------


class CaseDocumentSchema(CamelModel):
    """A supporting file attached to the case."""

    id: str
    requirement_id: str
    requirement_label: str
    file_name: str
    mime_type: str
    size_bytes: int
    uploaded_at: datetime
    status: DocumentStatus
    error_message: str | None = None
    extracted_at: datetime | None = None
    #: Agent C4 forensic risk level (badge). Present once the pipeline ran C4.
    fraud_risk: str | None = None
    #: Full C4 metadata-forensics result — signals and optional LLM verdict.
    fraud_analysis: FraudAnalysisSchema | None = None


class CompletenessItemSchema(CamelModel):
    """One line of the "pièces attendues" checklist.

    ``id`` carries the requirement key (``rib``, ``id_card``…), not the database
    row id: the frontend keys evidence and checklist entries by requirement, and
    the surrogate id would be meaningless to it.
    """

    id: str
    label: str
    received: bool
    required: bool


class CompletenessReportSchema(CamelModel):
    outcome: ReportOutcome
    checked_at: datetime
    completion_rate: int
    items: list[CompletenessItemSchema]


class CoherenceAnomalySchema(CamelModel):
    id: str
    severity: AnomalySeverity
    field: str
    declared_value: str
    observed_value: str
    message: str


class CoherenceReportSchema(CamelModel):
    outcome: ReportOutcome
    checked_at: datetime
    #: Overall 0–100 coherence score; null on legacy/seed reports.
    coherence_score: int | None = None
    #: The analyser's natural-language summary; null on legacy/seed reports.
    ai_explanation: str | None = None
    anomalies: list[CoherenceAnomalySchema]


class HouseholdSchema(CamelModel):
    marital_status: MaritalStatus
    dependent_children: int
    attached_adults: int


class HousingSchema(CamelModel):
    occupancy_status: OccupancyStatus
    living_area_sqm: int
    monthly_rent_excluding_charges: int
    address: str
    postal_code: str
    city: str


class CaseProfileSnapshotSchema(CamelModel):
    """Household and housing situation frozen at submission.

    Nested back into the shape the frontend declares, even though the columns
    are flat on the ``cases`` table. The storage layout is a persistence
    decision; the contract is not.
    """

    household: HouseholdSchema
    housing: HousingSchema
    annual_income: int
    captured_at: datetime


class DecisionEvidenceSchema(CamelModel):
    """A single verifiable fact drawn from the case, cited by a decision.

    The anti-hallucination primitive of the workflow. ``source`` points back
    into the Case it was read from, so any sentence shown to a citizen can be
    traced to the record that justifies it.
    """

    field: str
    value: str
    source: str


class CaseDecisionSchema(CamelModel):
    """An agent's formal decision.

    ``explanation`` is derived *from* ``evidence_used`` — that ordering is the
    guarantee: no explanation can assert something no evidence item states.
    """

    id: str
    case_id: str
    outcome: DecisionOutcome
    explanation: str
    evidence_used: list[DecisionEvidenceSchema]
    created_at: datetime
    decided_by: str
    #: Outcome of the automatic decision e-mail sent to the citizen:
    #: ``"sent"``, ``"failed"``, or ``None`` when there was no linked citizen
    #: account to notify. The decision itself is saved regardless — a failed
    #: send is reported here, never turned into an error response.
    email_status: str | None = None


class CaseDetailSchema(CamelModel):
    """The full ``Case`` aggregate — ``GET /agent/cases/{case_id}``."""

    id: str
    application_number: str
    citizen: CaseCitizenSchema
    submitted_at: datetime
    service: CaseServiceSchema
    score: CaseScoreSchema | None = None
    status: CaseStatus
    profile: CaseProfileSnapshotSchema
    documents: list[CaseDocumentSchema]
    completeness_report: CompletenessReportSchema | None = None
    coherence_report: CoherenceReportSchema | None = None
    decision: CaseDecisionSchema | None = None


class DecisionRequestSchema(CamelModel):
    """Body of ``POST /agent/cases/{case_id}/decision``.

    Only the outcome. Evidence and explanation are produced server-side from the
    case — a client that could supply them could justify a decision with facts
    the record does not contain.
    """

    outcome: DecisionOutcome
