"""The audit trail's tamper-evidence guarantee, at the hashing level.

These tests stay DB-free like the rest of the suite: they exercise the pure
hash-chain primitives that `verify_chain` relies on, which is where the
"immutable log" property actually lives. If these hold, altering any recorded
field or breaking the chain link is detectable; the router/DB wiring on top is
thin.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from app.modules.audit.models import GENESIS_HASH
from app.modules.audit.service import _canonical, _compute_hash


_FIXED = datetime(2026, 7, 26, 10, 0, 0, tzinfo=UTC)


def _hash(**overrides) -> str:
    base = dict(
        previous_hash=GENESIS_HASH,
        occurred_at=_FIXED,
        actor_user_id=7,
        actor_role="AGENT",
        action="decision_recorded",
        entity_type="case",
        entity_id="APL-abc",
        summary="Dossier APL-abc validated par X.",
        payload={"outcome": "validated", "evidence_count": 2},
    )
    base.update(overrides)
    return _compute_hash(**base)


def test_hash_is_deterministic() -> None:
    assert _hash() == _hash()


def test_payload_key_order_does_not_change_hash() -> None:
    # Canonicalisation sorts keys, so the same logical payload hashes identically
    # regardless of insertion order — a re-verification years later reproduces it.
    a = _hash(payload={"outcome": "validated", "evidence_count": 2})
    b = _hash(payload={"evidence_count": 2, "outcome": "validated"})
    assert a == b


def test_canonical_sorts_keys() -> None:
    assert _canonical({"b": 1, "a": 2}) == '{"a":2,"b":1}'


def test_changing_any_field_changes_the_hash() -> None:
    baseline = _hash()
    assert _hash(actor_user_id=8) != baseline
    assert _hash(actor_role="ADMIN") != baseline
    assert _hash(action="profile_updated") != baseline
    assert _hash(entity_type="citizen") != baseline
    assert _hash(entity_id="APL-xyz") != baseline
    assert _hash(summary="tampered") != baseline
    assert _hash(payload={"outcome": "rejected", "evidence_count": 2}) != baseline


def test_same_instant_hashes_identically_across_timezones() -> None:
    # The regression guard for the cross-session verify bug: a timestamptz read
    # back in a Europe/Paris session comes back as +01:00, the same instant the
    # writer hashed as +00:00. The hash must depend on the instant, not on the
    # timezone the driver happens to attach when the row is reloaded.
    paris = timezone(timedelta(hours=1))
    as_utc = _hash(occurred_at=datetime(2026, 7, 26, 18, 0, 0, tzinfo=UTC))
    as_paris = _hash(occurred_at=datetime(2026, 7, 26, 19, 0, 0, tzinfo=paris))
    assert as_utc == as_paris


def test_chain_link_binds_each_event_to_its_predecessor() -> None:
    # The whole point of the chain: an event's hash depends on the previous hash,
    # so re-parenting it (changing previous_hash) yields a different hash and the
    # link no longer matches — which verify_chain reports as a break.
    first = _hash()
    second_after_first = _hash(previous_hash=first)
    second_after_genesis = _hash(previous_hash=GENESIS_HASH)
    assert second_after_first != second_after_genesis
