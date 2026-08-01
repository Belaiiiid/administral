"""Schemas for job search (France Travail): a free-text prompt in, real
offers (optionally scored) out."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class JobSearchRequest(BaseModel):
    prompt: str


class JobOffer(CamelModel):
    """One real France Travail offer, distilled to what the citizen needs.

    `score`/`raison` are `None` whenever the scoring step didn't run or
    failed — the offer itself is still real and still shown; only the
    relevance judgment is missing, never fabricated to fill the gap.
    """

    id: str
    intitule: str
    entreprise: str | None = None
    lieu_libelle: str | None = None
    type_contrat: str | None = None
    description: str
    url: str | None = None
    score: int | None = Field(default=None, ge=0, le=100)
    raison: str | None = None


class JobSearchResult(CamelModel):
    available: bool
    unavailable_reason: str | None = None
    mots_cles: str | None = None
    departement: str | None = None
    offres: list[JobOffer] = Field(default_factory=list)
