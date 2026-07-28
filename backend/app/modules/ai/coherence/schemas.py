"""Schemas for cross-document coherence analysis (Module C1).

Ported from `MonParcours-nour/schemas.py`, adapted to the project's schema
conventions (camelCase on the wire, English field docstrings). The domain
vocabulary stays French — `coherent` / `incoherent` / `a_revoir` — because it
is the vocabulary the analysis prompt and the agent UI already speak, and
translating it would only add a lossy mapping table.

The pipeline this feeds:

    application → documents → completeness → **coherence (here)** → scoring → Case

The result is what the main domain model calls `Case.coherenceReport`. It is
produced *before* a case reaches the Agent Portal — the portal consumes it and
never recomputes it.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

CoherenceStatus = Literal["coherent", "incoherent", "a_revoir"]


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class Verification(CamelModel):
    """One documentary check, with its justification.

    Every field the analyser fills is traceable: a conclusion carries the
    reason, a confidence, the evidence excerpts it rests on, and the files it
    concerns. That traceability is the point — a coherence verdict a citizen or
    an agent cannot see the basis for is not usable.
    """

    #: The information family checked, e.g. `numero_cin`, `montant_loyer`.
    champ: str
    coherent: bool
    statut: CoherenceStatus
    #: Human-readable justification, in French.
    raison: str
    confiance: float = Field(ge=0.0, le=1.0)
    #: File names the check drew on, e.g. `["bail.pdf", "quittance.pdf"]`.
    fichiers_concernes: list[str] = Field(default_factory=list)
    #: Verbatim excerpts or values supporting the conclusion.
    preuves: list[str] = Field(default_factory=list)
    #: `documents` when read from the dossier, or a named external referential.
    source: str = "documents"


class ResultatCoherence(CamelModel):
    """Aggregated verdict for a whole dossier.

    `statut_global` is the *worst* status among the checks, not an average: one
    proven `incoherent` makes the dossier incoherent, and any `a_revoir` with no
    incoherence makes it reviewable. Coherence is the only status that must be
    earned by every check — which is what stops an unverifiable dossier from
    being waved through.
    """

    coherent_global: bool
    statut_global: CoherenceStatus
    #: Every check whose status is not `coherent`. A clean dossier yields [].
    incoherences: list[Verification]


class CoherenceRequest(CamelModel):
    """Input to `POST /ai/coherence/analyze`.

    Mirrors the shape the completeness pipeline (Squad B) produces: the citizen's
    declared profile plus the fields an OCR pass extracted from each document.
    Deliberately loose (`dict` / `list[dict]`) — the analyser interprets meaning
    across heterogeneous documents, so pinning every possible field here would
    fight the very flexibility the LLM step exists to provide.
    """

    profil_declare: dict
    documents_extraits: list[dict]
