"""Schemas for the job-offer match analysis (France Travail)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class JobMatchAnalysis(CamelModel):
    """Result of comparing one CV against one job offer.

    `available` is false whenever no real analysis ran (no Mistral key, an
    unreadable CV, a model failure) — every other field is then left at its
    default rather than carrying a fabricated score or skill list. A citizen
    reading `available: false` sees `unavailable_reason`, never a confident
    number that was actually never computed.
    """

    available: bool
    unavailable_reason: str | None = None
    score_pourcentage: int | None = Field(default=None, ge=0, le=100)
    competences_requises: list[str] = Field(default_factory=list)
    competences_correspondantes: list[str] = Field(default_factory=list)
    competences_manquantes: list[str] = Field(default_factory=list)
    documents_a_preparer: list[str] = Field(default_factory=list)
    explication: str | None = None
