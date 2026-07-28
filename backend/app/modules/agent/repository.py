"""Database queries for the agent case queue.

The only layer that writes SQL. Everything above receives ORM rows and never a
query object, so replacing SQLAlchemy is a change confined to this file.

It owns *how* to fetch, not *what the rules are*: the definition of "pending
decision" lives in the service and arrives here already expressed as a list of
statuses.
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, contains_eager, joinedload, selectinload

from app.modules.agent.models import (
    Case,
    CaseDecision,
    CaseDocument,
    CaseStatus,
    Citizen,
    CoherenceReport,
    CompletenessReport,
)


def find_case_summaries(
    db: Session,
    *,
    status: CaseStatus | None = None,
    search: str | None = None,
    undecided_statuses: Sequence[CaseStatus] | None = None,
) -> Sequence[Case]:
    """Cases for the instruction queue, longest-waiting first.

    Filtering happens in PostgreSQL, not in Python. Loading every case and
    filtering the list would work today with three rows, fall over at three
    thousand, and make the eventual pagination silently wrong.

    ``joinedload`` fetches the applicant in the same round trip; without it,
    reading ``case.citizen`` per row in the mapper is a classic N+1.
    """
    statement = select(Case).options(joinedload(Case.citizen))

    if status is not None:
        statement = statement.where(Case.status == status)

    if undecided_statuses is not None:
        statement = statement.where(Case.status.in_(undecided_statuses))

    if search and search.strip():
        term = f"%{search.strip()}%"
        statement = statement.join(Case.citizen).where(
            or_(
                Case.application_number.ilike(term),
                Citizen.first_name.ilike(term),
                Citizen.last_name.ilike(term),
            )
        )

    statement = statement.order_by(Case.submitted_at.asc())

    return db.execute(statement).unique().scalars().all()


def find_case_by_id(db: Session, case_id: str) -> Case | None:
    """One case with its whole aggregate loaded.

    ``selectinload`` for the collections rather than ``joinedload``: joining
    three one-to-many relations in a single query multiplies the rows
    (a cartesian product across documents × items × anomalies), so SQLAlchemy
    issues one follow-up query per collection instead.
    """
    statement = (
        select(Case)
        .where(Case.id == case_id)
        .options(
            joinedload(Case.citizen),
            selectinload(Case.documents),
            selectinload(Case.completeness_report).selectinload(CompletenessReport.items),
            selectinload(Case.coherence_report).selectinload(CoherenceReport.anomalies),
            selectinload(Case.decision).selectinload(CaseDecision.evidence_used),
        )
    )

    return db.execute(statement).unique().scalar_one_or_none()


def save_decision(db: Session, case: Case, decision: CaseDecision) -> CaseDecision:
    """Persist the decision and the status transition it represents.

    Both in one transaction: a decision row without its status change would
    leave the case sitting in the queue with a verdict already recorded, and an
    agent would decide it twice.
    """
    # Replacing an existing decision rather than raising: re-deciding is a
    # legitimate correction, and `case_id` is unique so an insert would fail.
    if case.decision is not None:
        db.delete(case.decision)
        db.flush()

    case.decision = decision
    case.status = CaseStatus(decision.outcome.value)

    db.add(case)
    db.commit()
    db.refresh(decision)

    return decision


#: Same severity ordering as `agent.assessment._RISK_PENALTY`, restated here to
#: rank rather than penalise: this picks the *worst* level present on a case's
#: documents, `_RISK_PENALTY` scores how much it costs the vigilance category.
_FRAUD_SEVERITY_RANK: dict[str, int] = {
    "CRITIQUE": 4,
    "ÉLEVÉ": 3,
    "MODÉRÉ": 2,
    "À VÉRIFIER": 1,
    "FAIBLE": 0,
    "INCONNU": 0,
}

#: Columns the CAF instructor list may sort by. A closed set, not an arbitrary
#: column name from the request: the query string reaches SQL only through
#: this mapping, and an unknown key falls back to the default in `find_case_page`.
SORTABLE_COLUMNS: dict[str, object] = {
    "submitted_at": Case.submitted_at,
    "application_number": Case.application_number,
    "status": Case.status,
    "score_value": Case.score_value,
    "completion_rate": CompletenessReport.completion_rate,
    "coherence_score": CoherenceReport.coherence_score,
}


def find_worst_fraud_risk_by_case(db: Session, case_ids: Sequence[str]) -> dict[str, str]:
    """The single worst ``fraud_risk`` per case, for the given case ids.

    One query regardless of page size — the alternative, eager-loading every
    document of every case on the page to compute this in Python, is exactly
    the over-fetch a list endpoint must avoid.
    """
    if not case_ids:
        return {}

    rows = db.execute(
        select(CaseDocument.case_id, CaseDocument.fraud_risk).where(
            CaseDocument.case_id.in_(case_ids), CaseDocument.fraud_risk.isnot(None)
        )
    ).all()

    worst: dict[str, str] = {}
    for case_id, risk in rows:
        current = worst.get(case_id)
        if current is None or _FRAUD_SEVERITY_RANK.get(risk, 0) > _FRAUD_SEVERITY_RANK.get(
            current, 0
        ):
            worst[case_id] = risk

    return worst


def find_case_page(
    db: Session,
    *,
    status: CaseStatus | None = None,
    search: str | None = None,
    sort_by: str = "submitted_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 20,
) -> tuple[Sequence[Case], int]:
    """One page of the CAF instructor list, plus the total row count.

    Completeness and coherence are LEFT OUTER JOINed — both are 1:1 with
    ``Case``, so the join cannot multiply rows — and eager-loaded from those
    same joined rows via ``contains_eager``: sorting by ``completion_rate`` or
    ``coherence_score`` needs them in the SQL anyway, so this is one query
    rather than a join for ordering plus a second fetch for the data.

    ``documents`` is deliberately not loaded here; the caller computes the
    per-case fraud status separately in one batched query over the returned
    case ids (``find_worst_fraud_risk_by_case``) — eager-loading every document
    of every row on a list endpoint is heavier than a list needs.

    The score is never recomputed here: ``Case.score_value`` and its sibling
    columns are read exactly as the scoring stage wrote them.
    """
    total = db.scalar(_count_statement(status=status, search=search)) or 0

    sort_column = SORTABLE_COLUMNS.get(sort_by, Case.submitted_at)
    order = sort_column.asc() if sort_dir == "asc" else sort_column.desc()

    statement = (
        select(Case)
        .join(Case.citizen)
        .outerjoin(Case.completeness_report)
        .outerjoin(Case.coherence_report)
        .options(
            contains_eager(Case.citizen),
            contains_eager(Case.completeness_report),
            contains_eager(Case.coherence_report),
        )
    )
    statement = _apply_filters(statement, status=status, search=search)
    statement = (
        # `Case.id` is a stable tie-breaker: two rows sharing the sorted value
        # (e.g. two cases with an identical score) must still page deterministically.
        statement.order_by(order, Case.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    rows = db.execute(statement).unique().scalars().all()
    return rows, int(total)


def _apply_filters(statement, *, status: CaseStatus | None, search: str | None):
    if status is not None:
        statement = statement.where(Case.status == status)

    if search and search.strip():
        term = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                Case.application_number.ilike(term),
                Citizen.first_name.ilike(term),
                Citizen.last_name.ilike(term),
            )
        )

    return statement


def _count_statement(*, status: CaseStatus | None, search: str | None):
    statement = select(func.count()).select_from(Case).join(Case.citizen)
    return _apply_filters(statement, status=status, search=search)


def count_queue_stats(
    db: Session, *, undecided_statuses: Sequence[CaseStatus]
) -> tuple[int, int, int]:
    """Aggregate counters over the *whole* table, not over a page.

    Three cheap aggregates rather than loading rows and tallying in Python: the
    moment the queue is paginated, a tally over loaded rows reports the size of
    the page instead of the size of the workload.

    Returns ``(pending, to_review_today, citizens_tracked)``.
    """
    pending = db.scalar(
        select(func.count()).select_from(Case).where(Case.status.in_(undecided_statuses))
    )

    to_review_today = db.scalar(
        select(func.count()).select_from(Case).where(Case.status == CaseStatus.ready_for_decision)
    )

    citizens_tracked = db.scalar(
        select(func.count(func.distinct(Case.citizen_id))).where(
            Case.status.in_(undecided_statuses)
        )
    )

    return (pending or 0, to_review_today or 0, citizens_tracked or 0)
