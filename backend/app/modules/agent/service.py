"""Agent case business logic.

Owns the rules. The repository owns the SQL, the router owns HTTP, and this
layer exists precisely so the rule below has somewhere to live that is neither
a query nor a request handler.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.core.security import mask_social_security_number
from app.modules.agent import assessment as assessment_service
from app.modules.agent import repository
from app.modules.agent.evidence import extract_blocking_evidence, extract_supporting_evidence
from app.modules.agent.models import Case, CaseStatus, DecisionOutcome
from app.modules.agent.models import CaseDecision as CaseDecisionModel
from app.modules.agent.models import DecisionEvidence as DecisionEvidenceModel
from app.modules.ai.fraud.schemas import FraudAnalysisSchema
from app.modules.audit import service as audit_service
from app.modules.audit.models import AuditAction
from app.modules.auth.models import User
from app.modules.notifications import service as notifications_service
from app.modules.agent.schemas import (
    AgentStatisticsSchema,
    CaseCitizenSchema,
    CaseDecisionSchema,
    CaseDetailSchema,
    CaseDocumentSchema,
    CaseProfileSnapshotSchema,
    CaseQueueStatsSchema,
    CaseScoreSchema,
    CaseServiceSchema,
    CaseStatusBreakdownSchema,
    CaseSummarySchema,
    MonthlyVolumeSchema,
    ServiceBreakdownSchema,
    CoherenceAnomalySchema,
    CoherenceReportSchema,
    CompletenessItemSchema,
    CompletenessReportSchema,
    DecisionEvidenceSchema,
    HouseholdSchema,
    HousingSchema,
)
from app.modules.ai.explanation import generate_explanation

def _agent_display_name(agent: User) -> str:
    """The deciding agent's name for the decision record.

    The "Décision humaine" guardrail requires a real, identified human on every
    decision — so the acting agent's own name is stamped here, resolved from the
    authenticated account, never a placeholder. Falls back to the e-mail only if
    the name columns are somehow empty.
    """
    full_name = f"{agent.first_name} {agent.last_name}".strip()
    return full_name or agent.email

#: Statuses meaning "an agent has concluded this case".
TERMINAL_STATUSES: tuple[CaseStatus, ...] = (CaseStatus.validated, CaseStatus.rejected)

#: Statuses meaning "still awaiting an agent decision".
#:
#: Derived by exclusion — everything that is not terminal — rather than listed
#: positively. A new intermediate ``CaseStatus`` therefore joins the queue by
#: default instead of silently vanishing from it, which is the safer failure
#: direction for a queue whose entire purpose is that nothing gets forgotten.
#:
#: Single source of truth for both the queue filter and the dashboard counters,
#: so the two cannot drift apart.
UNDECIDED_STATUSES: tuple[CaseStatus, ...] = tuple(
    status for status in CaseStatus if status not in TERMINAL_STATUSES
)


def _waiting_days(submitted_at: datetime, now: datetime) -> int:
    """Whole days elapsed since submission.

    Computed here rather than in the UI, per the contract. Both operands are
    made timezone-aware first: subtracting a naive datetime from an aware one
    raises, and rows written by a migration or by ``psql`` can come back naive.
    """
    if submitted_at.tzinfo is None:
        submitted_at = submitted_at.replace(tzinfo=UTC)

    return max(0, (now - submitted_at).days)


def _to_summary(case: Case, now: datetime) -> CaseSummarySchema:
    """ORM row → wire object.

    The single crossing point between persistence and the API, which is why the
    NIR masking happens here: every response passes through this function, so
    the rule cannot be skipped by a new caller.
    """
    score = None
    # The four score columns are written together or not at all; `None` means
    # scoring has not run, rather than the caller inspecting four fields.
    if (
        case.score_value is not None
        and case.score_band is not None
        and case.score_computed_at is not None
        and case.score_model is not None
    ):
        score = CaseScoreSchema(
            value=case.score_value,
            band=case.score_band,
            computed_at=case.score_computed_at,
            model=case.score_model,
        )

    return CaseSummarySchema(
        id=case.id,
        application_number=case.application_number,
        citizen=CaseCitizenSchema(
            id=case.citizen.id,
            first_name=case.citizen.first_name,
            last_name=case.citizen.last_name,
            email=case.citizen.email,
            birth_date=case.citizen.birth_date,
            masked_social_security_number=mask_social_security_number(
                case.citizen.social_security_number
            ),
        ),
        submitted_at=case.submitted_at,
        service=CaseServiceSchema(id=case.service_id, label=case.service_label),
        score=score,
        status=case.status,
        waiting_days=_waiting_days(case.submitted_at, now),
    )


def list_cases(
    db: Session,
    *,
    status: CaseStatus | None = None,
    search: str | None = None,
    pending_decision: bool = False,
) -> list[CaseSummarySchema]:
    """The instruction queue. Backs ``GET /agent/cases``."""
    cases = repository.find_case_summaries(
        db,
        status=status,
        search=search,
        undecided_statuses=UNDECIDED_STATUSES if pending_decision else None,
    )

    # One ``now`` for the whole page, so two rows submitted a millisecond apart
    # cannot report waiting days computed against different clocks.
    now = datetime.now(UTC)

    return [_to_summary(case, now) for case in cases]


def _to_decision_schema(decision: CaseDecisionModel) -> CaseDecisionSchema:
    return CaseDecisionSchema(
        id=decision.id,
        case_id=decision.case_id,
        outcome=decision.outcome,
        explanation=decision.explanation,
        evidence_used=[
            DecisionEvidenceSchema(field=e.field, value=e.value, source=e.source)
            for e in decision.evidence_used
        ],
        created_at=decision.created_at,
        decided_by=decision.decided_by,
    )


def get_case(db: Session, case_id: str) -> CaseDetailSchema:
    """One case in full. Backs ``GET /agent/cases/{case_id}``."""
    case = repository.find_case_by_id(db, case_id)

    if case is None:
        raise NotFoundError(f"Aucun dossier ne correspond à l’identifiant « {case_id} ».")

    score = None
    if (
        case.score_value is not None
        and case.score_band is not None
        and case.score_computed_at is not None
        and case.score_model is not None
    ):
        score = CaseScoreSchema(
            value=case.score_value,
            band=case.score_band,
            computed_at=case.score_computed_at,
            model=case.score_model,
        )

    completeness = None
    if case.completeness_report is not None:
        completeness = CompletenessReportSchema(
            outcome=case.completeness_report.outcome,
            checked_at=case.completeness_report.checked_at,
            completion_rate=case.completeness_report.completion_rate,
            items=[
                # `id` carries the requirement key, not the row id — the
                # frontend keys checklist entries by requirement.
                CompletenessItemSchema(
                    id=item.item_key,
                    label=item.label,
                    received=item.received,
                    required=item.required,
                )
                for item in case.completeness_report.items
            ],
        )

    coherence = None
    if case.coherence_report is not None:
        coherence = CoherenceReportSchema(
            outcome=case.coherence_report.outcome,
            checked_at=case.coherence_report.checked_at,
            coherence_score=case.coherence_report.coherence_score,
            ai_explanation=case.coherence_report.ai_explanation,
            anomalies=[
                CoherenceAnomalySchema(
                    id=a.id,
                    severity=a.severity,
                    field=a.field,
                    declared_value=a.declared_value,
                    observed_value=a.observed_value,
                    message=a.message,
                )
                for a in case.coherence_report.anomalies
            ],
        )

    return CaseDetailSchema(
        id=case.id,
        application_number=case.application_number,
        citizen=CaseCitizenSchema(
            id=case.citizen.id,
            first_name=case.citizen.first_name,
            last_name=case.citizen.last_name,
            email=case.citizen.email,
            birth_date=case.citizen.birth_date,
            masked_social_security_number=mask_social_security_number(
                case.citizen.social_security_number
            ),
        ),
        submitted_at=case.submitted_at,
        service=CaseServiceSchema(id=case.service_id, label=case.service_label),
        score=score,
        status=case.status,
        profile=CaseProfileSnapshotSchema(
            household=HouseholdSchema(
                marital_status=case.marital_status,
                dependent_children=case.dependent_children,
                attached_adults=case.attached_adults,
            ),
            housing=HousingSchema(
                occupancy_status=case.occupancy_status,
                living_area_sqm=case.living_area_sqm,
                monthly_rent_excluding_charges=case.monthly_rent_excluding_charges,
                address=case.address,
                postal_code=case.postal_code,
                city=case.city,
            ),
            annual_income=case.annual_income,
            captured_at=case.profile_captured_at,
        ),
        documents=[
            CaseDocumentSchema(
                id=d.id,
                requirement_id=d.requirement_id,
                requirement_label=d.requirement_label,
                file_name=d.file_name,
                mime_type=d.mime_type,
                size_bytes=d.size_bytes,
                uploaded_at=d.uploaded_at,
                status=d.status,
                error_message=d.error_message,
                extracted_at=d.extracted_at,
                fraud_risk=d.fraud_risk,
                fraud_analysis=(
                    FraudAnalysisSchema.model_validate(d.fraud_analysis)
                    if d.fraud_analysis
                    else None
                ),
            )
            for d in case.documents
        ],
        completeness_report=completeness,
        coherence_report=coherence,
        decision=_to_decision_schema(case.decision) if case.decision else None,
    )


def decide_case(
    db: Session, case_id: str, outcome: DecisionOutcome, *, agent: User
) -> CaseDecisionSchema:
    """Record an agent's decision. Backs ``POST /agent/cases/{case_id}/decision``.

    The sequence is the contract, and the order matters:

      1. load the case
      2. extract evidence *from the case*
      3. refuse a rejection that no evidence supports
      4. formulate the explanation from that evidence
      5. write the audit trace and persist decision + status transition

    Step 3 before step 4 is the business rule: a rejection with nothing behind
    it is refused outright rather than explained vaguely. Step 2 before step 4
    is the anti-hallucination guarantee — the explanation is derived from the
    evidence, so it cannot assert something the record does not contain.

    ``agent`` is the authenticated human making the call: their name is stamped
    on the decision (the "Décision humaine" guardrail) and recorded as the actor
    of the audit event, which is written into the same transaction as the
    decision so an untraceable ruling cannot exist.
    """
    case = repository.find_case_by_id(db, case_id)

    if case is None:
        raise NotFoundError(f"Aucun dossier ne correspond à l’identifiant « {case_id} ».")

    evidence = (
        extract_blocking_evidence(case)
        if outcome == DecisionOutcome.rejected
        else extract_supporting_evidence(case)
    )

    if outcome == DecisionOutcome.rejected and not evidence:
        raise ValidationError(
            "Ce dossier ne présente aucun motif de rejet vérifiable : aucune pièce "
            "manquante, aucune incohérence relevée. Un rejet doit s’appuyer sur un "
            "élément du dossier."
        )

    explanation = generate_explanation(outcome, evidence)

    decision = CaseDecisionModel(
        case_id=case.id,
        outcome=outcome,
        explanation=explanation,
        decided_by=_agent_display_name(agent),
        created_at=datetime.now(UTC),
        evidence_used=[
            DecisionEvidenceModel(field=e.field, value=e.value, source=e.source)
            for e in evidence
        ],
    )

    # Trace the ruling *before* it is committed: `record` adds the event to this
    # session, and `save_decision`'s commit persists both together, so the
    # decision and its audit entry are atomic (see audit.service.record).
    audit_service.record(
        db,
        action=AuditAction.decision_recorded,
        entity_type="case",
        entity_id=case.application_number,
        actor=agent,
        summary=(
            f"Dossier {case.application_number} {outcome.value} "
            f"par {decision.decided_by}."
        ),
        payload={
            "case_id": case.id,
            "outcome": outcome.value,
            "evidence_count": len(evidence),
        },
    )

    saved = repository.save_decision(db, case, decision)

    # The dossier now has a verdict — tell the citizen who owns it. Best-effort:
    # `emit_decision` never raises, and no-ops for a legacy case whose applicant
    # was never linked to an account.
    notifications_service.emit_decision(
        db,
        citizen_user_id=case.citizen.user_id,
        validated=outcome == DecisionOutcome.validated,
        application_number=case.application_number,
    )

    return _to_decision_schema(saved)


def get_case_assessment(
    db: Session, case_id: str, *, agent: User
) -> assessment_service.MonParcoursResult:
    """The unified MonParcours Result. Backs ``GET /agent/cases/{id}/assessment``.

    Loads the whole aggregate (reports, documents, fraud) and delegates to the
    deterministic assessment service, which recomputes the result, persists it
    when it changed, and records the audit event. No verdict is decided here —
    the result is decision support for the agent.
    """
    case = repository.find_case_by_id(db, case_id)
    if case is None:
        raise NotFoundError(f"Aucun dossier ne correspond à l’identifiant « {case_id} ».")
    return assessment_service.get_or_refresh_assessment(db, case, actor=agent)


def get_queue_stats(db: Session) -> CaseQueueStatsSchema:
    """Dashboard workload counters. Backs ``GET /agent/cases/stats``."""
    pending, to_review_today, citizens_tracked = repository.count_queue_stats(
        db, undecided_statuses=UNDECIDED_STATUSES
    )

    return CaseQueueStatsSchema(
        pending=pending,
        to_review_today=to_review_today,
        citizens_tracked=citizens_tracked,
    )


#: How far back the submissions chart reaches. Twelve months so the series
#: always spans a full year of seasonality rather than a partial one.
STATISTICS_MONTHS = 12


def get_statistics_overview(db: Session) -> AgentStatisticsSchema:
    """Service-level indicators. Backs ``GET /agent/stats/overview``.

    Read-only: every figure is an aggregate over rows the instruction workflow
    already writes. Nothing here creates, mutates or interprets a case — adding
    a statistic must never become a reason for the queue to behave differently.
    """
    status_counts = repository.count_cases_by_status(db)

    # Absent status → 0. The schema declares all six, so a status nobody has
    # reached yet renders as an empty row instead of vanishing from the table.
    by_status = CaseStatusBreakdownSchema(
        submitted=status_counts.get(CaseStatus.submitted, 0),
        awaiting_documents=status_counts.get(CaseStatus.awaiting_documents, 0),
        under_review=status_counts.get(CaseStatus.under_review, 0),
        ready_for_decision=status_counts.get(CaseStatus.ready_for_decision, 0),
        validated=status_counts.get(CaseStatus.validated, 0),
        rejected=status_counts.get(CaseStatus.rejected, 0),
    )

    return AgentStatisticsSchema(
        citizens_total=repository.count_citizens(db),
        citizens_with_cases=repository.count_citizens_with_cases(db),
        # Summed from the breakdown rather than counted again: two queries could
        # disagree under concurrent writes, and the table must equal its total.
        cases_total=sum(status_counts.values()),
        by_status=by_status,
        by_service=[
            ServiceBreakdownSchema(service_id=service_id, label=label, count=count)
            for service_id, label, count in repository.count_cases_by_service(db)
        ],
        monthly_submissions=[
            MonthlyVolumeSchema(month=month, count=count)
            for month, count in repository.count_submissions_by_month(
                db, months=STATISTICS_MONTHS
            )
        ],
        average_processing_days=repository.average_processing_days(db),
        average_completion_rate=repository.average_completion_rate(db),
        average_score=repository.average_score(db),
    )
