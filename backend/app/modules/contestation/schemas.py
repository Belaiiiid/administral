"""Wire shapes for the contestation flow — camelCase, ``from_attributes``.

The request bodies deliberately carry only what the citizen or agent supplies;
identity comes from the JWT and the dossier link is resolved server-side. A
client never names whose contestation it is, nor which citizen or decision a
row belongs to — the same rule the profile and decision endpoints follow.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.modules.contestation.models import ContestationReason, ContestationStatus


class _Base(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------


class ContestationCreateRequest(_Base):
    """Body of ``POST /contestations`` (citizen).

    ``application_number`` identifies the dossier; the server resolves the case
    and verifies the caller owns it. ``reason`` is a fixed category; the free
    text goes in ``description``.
    """

    application_number: str = Field(min_length=1, max_length=64)
    reason: ContestationReason
    description: str = Field(min_length=10, max_length=4000)


class ContestationResolveRequest(_Base):
    """Body of ``PATCH /contestations/{id}/resolve`` (agent).

    ``accept`` decides the outcome; ``resolution_comment`` is the human's
    reasoning and is mandatory — a resolution without an explanation is refused.
    """

    accept: bool
    resolution_comment: str = Field(min_length=1, max_length=4000)


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------


class ContestedDecisionSchema(_Base):
    """The dossier's decision, shown as context when reviewing a contestation."""

    outcome: str
    explanation: str
    decided_by: str
    decided_at: datetime


class ContestationSummarySchema(_Base):
    """Row projection for the agent queue — ``GET /contestations``."""

    id: str
    application_number: str
    citizen_name: str
    reason: ContestationReason
    reason_label: str
    status: ContestationStatus
    reviewed_by: str | None = None
    created_at: datetime
    updated_at: datetime


class ContestationSchema(_Base):
    """One contestation in full — agent detail, citizen read side, create result."""

    id: str
    dossier_id: str
    application_number: str
    citizen_id: str
    citizen_name: str
    original_decision_id: str | None = None
    reason: ContestationReason
    reason_label: str
    description: str
    status: ContestationStatus
    reviewed_by: str | None = None
    resolution_comment: str | None = None
    created_at: datetime
    updated_at: datetime
    #: The dossier's decision, for context. Null only for a legacy dossier with
    #: no recorded decision (a contestation cannot normally be opened on one).
    decision: ContestedDecisionSchema | None = None
