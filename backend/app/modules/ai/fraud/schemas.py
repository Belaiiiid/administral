"""Wire schemas for document fraud analysis (Agent C4).

New feature, so a clean camelCase contract — authored on both ends.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class FraudLlmSchema(CamelModel):
    """The optional Mistral forensic verdict."""

    niveau_risque: str
    verdict: str
    signaux_llm: list[str]
    analyse_llm: str
    recommandation: str


class FraudAnalysisSchema(CamelModel):
    """Full metadata-forensics result for one document."""

    fichier: str
    type_fichier: str | None = None
    date_creation: str | None = None
    date_modification: str | None = None
    logiciel: str | None = None
    auteur_declare: str | None = None
    #: Deterministic signals — always computed.
    signaux_a_verifier: list[str]
    #: Optional LLM layer; null when no key is configured.
    analyse_llm: FraudLlmSchema | None = None
    #: Overall risk for a badge: the LLM level if present, else derived from the
    #: deterministic signals (any signal → À VÉRIFIER, none → FAIBLE).
    niveau_risque: str
    #: Convenience flag for the UI.
    a_des_signaux: bool
    #: Set when the file could not be analysed (unsupported format, unreadable).
    erreur: str | None = None
