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
from app.modules.agent import repository
from app.modules.agent.evidence import extract_blocking_evidence, extract_supporting_evidence
from app.modules.agent.models import Case, CaseStatus, DecisionOutcome
from app.modules.agent.models import CaseDecision as CaseDecisionModel
from app.modules.agent.models import DecisionEvidence as DecisionEvidenceModel
from app.modules.ai.fraud.schemas import FraudAnalysisSchema
from app.modules.agent.schemas import (
    CaseCitizenSchema,
    CaseDecisionSchema,
    CaseDetailSchema,
    CaseDocumentSchema,
    CaseProfileSnapshotSchema,
    CaseQueueStatsSchema,
    CaseScoreSchema,
    CaseServiceSchema,
    CaseSummarySchema,
    CoherenceAnomalySchema,
    CoherenceReportSchema,
    CompletenessItemSchema,
    CompletenessReportSchema,
    DecisionEvidenceSchema,
    HouseholdSchema,
    HousingSchema,
)
from app.modules.ai.explanation import generate_explanation

#: Until an auth module exists there is no real agent identity, and inventing a
#: plausible name would put a fake civil servant's name on a decision record.
DECIDING_AGENT = "Agent (démonstration)"

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


def decide_case(db: Session, case_id: str, outcome: DecisionOutcome) -> CaseDecisionSchema:
    """Record an agent's decision. Backs ``POST /agent/cases/{case_id}/decision``.

    The sequence is the contract, and the order matters:

      1. load the case
      2. extract evidence *from the case*
      3. refuse a rejection that no evidence supports
      4. formulate the explanation from that evidence
      5. persist decision + status transition

    Step 3 before step 4 is the business rule: a rejection with nothing behind
    it is refused outright rather than explained vaguely. Step 2 before step 4
    is the anti-hallucination guarantee — the explanation is derived from the
    evidence, so it cannot assert something the record does not contain.
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
        decided_by=DECIDING_AGENT,
        created_at=datetime.now(UTC),
        evidence_used=[
            DecisionEvidenceModel(field=e.field, value=e.value, source=e.source)
            for e in evidence
        ],
    )

    return _to_decision_schema(repository.save_decision(db, case, decision))


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
