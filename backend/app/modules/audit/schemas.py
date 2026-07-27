"""Wire shapes for the audit trail.

camelCase on the wire (the frontend convention), ``from_attributes`` so an
``AuditEvent`` ORM row validates straight through.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.modules.audit.models import AuditAction


class _Base(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


class AuditEventSchema(_Base):
    id: int
    occurred_at: datetime
    actor_user_id: int | None = None
    actor_role: str
    action: AuditAction
    entity_type: str
    entity_id: str
    summary: str
    payload: dict
    previous_hash: str
    event_hash: str


class AuditTrailResponse(_Base):
    """A trail plus a per-response integrity check, so the reader is told whether
    the entries they are looking at still verify — not just handed the rows."""

    entity_type: str
    entity_id: str
    events: list[AuditEventSchema]
    chain_intact: bool


class ChainIntegrityResponse(_Base):
    """The result of verifying the whole global chain (admin diagnostics)."""

    intact: bool
    #: The id of the first event that fails verification, or ``None`` when intact.
    first_broken_event_id: int | None = None
    total_events: int
