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
    CaseCitizenSchema,
    CaseDecisionSchema,
    CaseDetailSchema,
    CaseDocumentSchema,
    CaseListItemSchema,
    CaseListPageSchema,
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


def _to_list_item(case: Case, now: datetime, fraud_status: str | None) -> CaseListItemSchema:
    """ORM row → CAF instructor list row.

    Builds on the same score/citizen projection as `_to_summary`, plus the
    three read-only signals the list adds. Each is read exactly as an earlier
    stage wrote it: `completion_rate` and `coherence_status` come straight off
    the eager-loaded reports, `fraud_status` is passed in already computed by
    the caller's single batched query — never recalculated here.
    """
    summary = _to_summary(case, now)

    return CaseListItemSchema(
        id=summary.id,
        application_number=summary.application_number,
        citizen=summary.citizen,
        submitted_at=summary.submitted_at,
        service=summary.service,
        score=summary.score,
        status=summary.status,
        waiting_days=summary.waiting_days,
        completion_rate=(
            case.completeness_report.completion_rate
            if case.completeness_report is not None
            else None
        ),
        coherence_status=(
            case.coherence_report.outcome if case.coherence_report is not None else None
        ),
        fraud_status=fraud_status,
    )


def list_case_page(
    db: Session,
    *,
    status: CaseStatus | None = None,
    search: str | None = None,
    sort_by: str = "submitted_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 20,
) -> CaseListPageSchema:
    """The CAF instructor list. Backs ``GET /agent/cases/list``.

    Reads straight from PostgreSQL, paginated and sorted in SQL — see
    `repository.find_case_page` for why. The fraud status is a second, batched
    query over just this page's case ids, never a per-row lookup.
    """
    cases, total = repository.find_case_page(
        db,
        status=status,
        search=search,
        sort_by=sort_by,
        sort_dir=sort_dir,
        page=page,
        page_size=page_size,
    )

    fraud_status_by_case = repository.find_worst_fraud_risk_by_case(
        db, [case.id for case in cases]
    )

    now = datetime.now(UTC)

    return CaseListPageSchema(
        items=[_to_list_item(case, now, fraud_status_by_case.get(case.id)) for case in cases],
        total=total,
        page=page,
        page_size=page_size,
    )


def _to_decision_schema(
    decision: CaseDecisionModel, *, email_status: str | None = None
) -> CaseDecisionSchema:
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
        email_status=email_status,
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

    # The dossier now has a verdict — tell the citizen who owns it. Both calls
    # are best-effort and only run after the line above has committed: a
    # notification or e-mail failure must never look like the decision failed.
    notifications_service.emit_decision(
        db,
        citizen_user_id=case.citizen.user_id,
        validated=outcome == DecisionOutcome.validated,
        application_number=case.application_number,
    )

    # The authoritative decision e-mail: reference, decision, date and an
    # LLM-generated, dossier-verified reason. Distinct from `emit_decision`'s
    # in-app notice above — see `send_decision_email` for why it is not folded
    # into it. `email_status` travels back to the caller so a delivery failure
    # is visible without ever turning this endpoint's response into an error.
    email_status = notifications_service.send_decision_email(
        db, case=case, decision=saved, evidence=evidence
    )

    return _to_decision_schema(saved, email_status=email_status)


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
