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
from sqlalchemy.orm import Session, joinedload, selectinload

from app.modules.agent.models import (
    Case,
    CaseDecision,
    CaseStatus,
    Citizen,
    CoherenceAnomaly,
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


def upsert_coherence_report(
    db: Session,
    *,
    case: Case,
    report: CoherenceReport,
) -> CoherenceReport:
    """Persist (or replace) the coherence report for a case.

    If a report already exists the old one is deleted first: ``case_id`` is a
    unique key, so a blind INSERT would raise.  Both the delete and the insert
    happen in the same transaction so the case is never transiently report-less.
    """
    if case.coherence_report is not None:
        db.delete(case.coherence_report)
        db.flush()

    case.coherence_report = report
    db.add(case)
    db.commit()
    db.refresh(report)

    return report

