"""Writing and reading the audit trail, and verifying its chain.

**Writing** (`record`) is deliberately *not* best-effort, unlike notifications:
a guardrail whose whole point is "every action leaves a trace" must not let the
action commit while its trace silently fails. So `record` adds the event to the
caller's session and lets the caller's own transaction commit it — the audit
entry and the action it records commit or roll back **together**. An untraceable
decision therefore cannot happen, and a decision cannot happen without its trace.

**The hash chain.** Each event's ``event_hash`` is the SHA-256 of a canonical
serialisation of its content *together with* the previous event's hash. Because
every hash depends on the one before, editing or deleting any past row changes
every hash after it, and `verify_chain` recomputes the whole chain to detect
exactly that. This gives the "log immuable SHA-256" the technical spec asks for
without needing a write-once datastore.

A note on concurrency: `record` reads the latest hash, then inserts. Two events
recorded in truly simultaneous transactions could both chain onto the same
predecessor; the ``event_hash`` unique constraint makes an *identical* collision
fail loudly rather than corrupt silently, and at this service's scale (one event
per human action) contention is not a practical concern. A high-throughput
deployment would serialise writes on the chain tail — noted, not needed yet.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.audit.models import GENESIS_HASH, AuditAction, AuditEvent
from app.modules.auth.models import User


def _canonical(payload: dict) -> object:
    """A stable, comparable form of the payload for hashing.

    ``sort_keys`` + fixed separators means the same logical payload always
    hashes identically regardless of key order or incidental whitespace, so a
    re-verification years later reproduces the original hash byte-for-byte.
    """
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def _compute_hash(
    *,
    previous_hash: str,
    occurred_at: datetime,
    actor_user_id: int | None,
    actor_role: str,
    action: str,
    entity_type: str,
    entity_id: str,
    summary: str,
    payload: dict,
) -> str:
    """SHA-256 of the event content chained onto ``previous_hash``.

    ``occurred_at`` is canonicalised to UTC before serialising. The same instant
    must hash identically no matter how it is *represented* when read back: a
    ``timestamptz`` reloaded in a session whose timezone is ``Europe/Paris``
    comes back as ``+01:00``, and a naive ``isoformat()`` of that would differ
    from the ``+00:00`` string hashed at write time — making ``verify_chain``
    cry tamper in any non-UTC session. Normalising to UTC (assuming UTC for a
    naive value, as the writer always uses ``datetime.now(UTC)``) makes the hash
    depend on the instant, not on the driver's timezone.
    """
    ts = occurred_at if occurred_at.tzinfo is not None else occurred_at.replace(tzinfo=UTC)
    material = "|".join(
        [
            previous_hash,
            ts.astimezone(UTC).isoformat(),
            str(actor_user_id) if actor_user_id is not None else "",
            actor_role,
            action,
            entity_type,
            entity_id,
            summary,
            _canonical(payload),
        ]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _latest_hash(db: Session) -> str:
    """The tail of the chain — the newest event's hash, or the genesis link."""
    last = db.execute(
        select(AuditEvent.event_hash).order_by(AuditEvent.id.desc()).limit(1)
    ).scalar_one_or_none()
    return last or GENESIS_HASH


def record(
    db: Session,
    *,
    action: AuditAction,
    entity_type: str,
    entity_id: str,
    summary: str,
    actor: User | None = None,
    payload: dict | None = None,
) -> AuditEvent:
    """Append one event to the trail, within the caller's transaction.

    Adds and flushes but does **not** commit: the caller's commit (the one that
    persists the audited action) persists this event too, so the two are atomic.
    If the caller rolls back, the audit entry rolls back with it — there is no
    orphaned trace of an action that did not happen.
    """
    previous_hash = _latest_hash(db)
    occurred_at = datetime.now(UTC)
    actor_user_id = actor.id if actor is not None else None
    actor_role = actor.role.value if actor is not None else "system"
    payload = payload or {}

    event_hash = _compute_hash(
        previous_hash=previous_hash,
        occurred_at=occurred_at,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action=action.value,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
        payload=payload,
    )

    event = AuditEvent(
        occurred_at=occurred_at,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
        payload=payload,
        previous_hash=previous_hash,
        event_hash=event_hash,
    )
    db.add(event)
    db.flush()
    return event


def list_for_entity(db: Session, *, entity_type: str, entity_id: str) -> list[AuditEvent]:
    """The trail for one dossier or profile, oldest first (the order it happened)."""
    stmt = (
        select(AuditEvent)
        .where(AuditEvent.entity_type == entity_type, AuditEvent.entity_id == entity_id)
        .order_by(AuditEvent.id.asc())
    )
    return list(db.execute(stmt).scalars().all())


def list_recent(db: Session, *, limit: int = 200) -> list[AuditEvent]:
    """The most recent events across everything, newest first (admin overview)."""
    stmt = select(AuditEvent).order_by(AuditEvent.id.desc()).limit(limit)
    return list(db.execute(stmt).scalars().all())


def verify_chain(db: Session) -> tuple[bool, int | None]:
    """Recompute the whole chain and report the first break.

    Returns ``(True, None)`` when every row's ``event_hash`` recomputes to its
    stored value and every ``previous_hash`` matches the prior row's hash;
    otherwise ``(False, id)`` where ``id`` is the first event that fails — the
    point at which the trail was altered.
    """
    events = list(db.execute(select(AuditEvent).order_by(AuditEvent.id.asc())).scalars().all())
    expected_previous = GENESIS_HASH
    for event in events:
        if event.previous_hash != expected_previous:
            return False, event.id
        recomputed = _compute_hash(
            previous_hash=event.previous_hash,
            occurred_at=event.occurred_at,
            actor_user_id=event.actor_user_id,
            actor_role=event.actor_role,
            action=event.action.value,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            summary=event.summary,
            payload=event.payload,
        )
        if recomputed != event.event_hash:
            return False, event.id
        expected_previous = event.event_hash
    return True, None
