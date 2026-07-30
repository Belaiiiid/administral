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


class FraudRegionSchema(CamelModel):
    """One ELA-suspicious area in pixels of the displayed page image."""

    x: int
    y: int
    width: int
    height: int
    confidence_pct: float


class FraudVisualSchema(CamelModel):
    """ELA result for one page, with an agent-ready annotated image."""

    page_number: int
    is_suspicious: bool
    regions: list[FraudRegionSchema]
    marked_image_base64: str
    metrics: dict[str, float | int]


class DocumentIntegritySchema(CamelModel):
    content_hash: str
    exact_duplicate_in_dossier: bool
    qr_codes_detected: int
    mrz_detected: bool
    mrz_checksum_valid: bool | None = None
    pdf_signature_state: str
    issuer_verification_status: str


class VisionModelSchema(CamelModel):
    provider: str
    status: str
    score: float | None = None
    message: str
    device: str | None = None
    pages: list[FraudVisualSchema] = []


class DetectorContributionSchema(CamelModel):
    """One calibrated evidence contribution used by the fusion engine."""

    detector: str
    status: str
    raw_score: float | None = None
    score: float | None = None
    confidence: float
    weight: float = 0.0
    contribution: float = 0.0
    explanation: str
    limitations: list[str] = []
    depreciation_applied: bool = False
    depreciation_reason: str | None = None


class SuspectRegionSchema(CamelModel):
    """A merged, agent-facing region on the original displayed document."""

    page_number: int
    x: int
    y: int
    width: int
    height: int
    suspicion: float
    confidence: float
    detectors: list[str]
    explanation: str
    corroborated: bool


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
    #: Flag for unlocalized but high-confidence signals that require human attention
    manual_review_recommended: bool = False
    #: Convenience flag for the UI.
    a_des_signaux: bool
    #: ELA page visuals. Empty when the file cannot be decoded as a PDF/image.
    ela_visuals: list[FraudVisualSchema] = []
    #: Structural facts (hash, QR, MRZ and PDF signature field) that an agent can verify.
    integrity: DocumentIntegritySchema | None = None
    #: Optional deep-learning localisation service. Non-configured is explicit, never hidden.
    vision_model: VisionModelSchema | None = None
    #: New Evidence Fusion contract. Kept additive for existing consumers.
    score_final: float | None = None
    confiance: float | None = None
    contributions: list[DetectorContributionSchema] = []
    zones_suspectes: list[SuspectRegionSchema] = []
    visualisations_fusionnees: list[FraudVisualSchema] = []
    analyses_non_applicables: list[str] = []
    #: Set when the file could not be analysed (unsupported format, unreadable).
    erreur: str | None = None
