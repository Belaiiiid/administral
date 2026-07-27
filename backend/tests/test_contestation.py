"""The contestation state machine and its audit trace, at the logic level.

DB-free like the rest of the suite: these exercise the pure transition rules the
service enforces and confirm that the three contestation actions hash into the
audit chain exactly like any other event (so the challenge and its resolution
are as tamper-evident as the decision they concern). The router/DB wiring on top
is thin and verified live.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.exceptions import ValidationError
from app.modules.audit.models import GENESIS_HASH
from app.modules.audit.service import _compute_hash
from app.modules.contestation.models import ContestationReason, ContestationStatus
from app.modules.contestation.service import (
    RESOLVED_STATUSES,
    _ensure_transition,
    can_transition,
)

S = ContestationStatus


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------


def test_pending_may_go_to_review_or_either_resolution() -> None:
    assert can_transition(S.PENDING, S.UNDER_REVIEW)
    assert can_transition(S.PENDING, S.ACCEPTED)
    assert can_transition(S.PENDING, S.REJECTED)


def test_under_review_may_only_resolve() -> None:
    assert can_transition(S.UNDER_REVIEW, S.ACCEPTED)
    assert can_transition(S.UNDER_REVIEW, S.REJECTED)
    # Cannot go back to PENDING once review has started.
    assert not can_transition(S.UNDER_REVIEW, S.PENDING)


def test_resolved_states_are_terminal() -> None:
    for terminal in RESOLVED_STATUSES:
        for target in S:
            assert not can_transition(terminal, target), (terminal, target)


def test_no_self_transitions() -> None:
    for status in S:
        assert not can_transition(status, status)


def test_ensure_transition_raises_on_illegal_move() -> None:
    # Re-resolving a settled contestation is exactly the double-answer the state
    # machine exists to forbid.
    with pytest.raises(ValidationError):
        _ensure_transition(S.ACCEPTED, S.REJECTED)
    with pytest.raises(ValidationError):
        _ensure_transition(S.REJECTED, S.UNDER_REVIEW)


def test_ensure_transition_allows_legal_move() -> None:
    # Should not raise.
    _ensure_transition(S.PENDING, S.UNDER_REVIEW)
    _ensure_transition(S.UNDER_REVIEW, S.ACCEPTED)


# ---------------------------------------------------------------------------
# Audit integration — the contestation actions chain like any other event
# ---------------------------------------------------------------------------


_FIXED = datetime(2026, 7, 26, 12, 0, 0, tzinfo=UTC)


def _hash(**overrides) -> str:
    base = dict(
        previous_hash=GENESIS_HASH,
        occurred_at=_FIXED,
        actor_user_id=42,
        actor_role="CITIZEN",
        action="contestation_created",
        entity_type="case",
        entity_id="APL-abc",
        summary="Contestation déposée sur le dossier APL-abc.",
        payload={"reason": "erreur_calcul", "contested_outcome": "rejected"},
    )
    base.update(overrides)
    return _compute_hash(**base)


def test_contestation_event_hash_is_deterministic() -> None:
    assert _hash() == _hash()


def test_each_contestation_action_hashes_distinctly() -> None:
    created = _hash(action="contestation_created")
    review = _hash(action="contestation_review_started")
    resolved = _hash(action="contestation_resolved")
    assert len({created, review, resolved}) == 3


def test_changing_resolution_payload_changes_hash() -> None:
    accepted = _hash(payload={"contestation_id": "x", "resolution": "ACCEPTED"})
    rejected = _hash(payload={"contestation_id": "x", "resolution": "REJECTED"})
    assert accepted != rejected


def test_reason_labels_cover_every_reason() -> None:
    from app.modules.contestation.models import REASON_LABELS

    for reason in ContestationReason:
        assert reason in REASON_LABELS and REASON_LABELS[reason]
