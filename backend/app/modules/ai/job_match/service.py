"""Job-offer match analysis — CV text extraction, then Mistral, then done.

The single entry point the router calls. No DB, no `Application`: the CV is
read for its text and discarded, matching the feature's stateless design —
nothing here persists past the request/response cycle.
"""

from __future__ import annotations

from app.modules.ai.job_match.mistral_client import analyze_job_match_llm
from app.modules.ai.job_match.schemas import JobMatchAnalysis
from app.modules.citizen.extraction import extract_text


def _unavailable(reason: str) -> JobMatchAnalysis:
    return JobMatchAnalysis(available=False, unavailable_reason=reason)


def analyze_job_match(offer_text: str, cv_bytes: bytes, cv_mime_type: str) -> JobMatchAnalysis:
    """Compare a CV against a job offer. Never raises — a failure is a result."""
    extraction = extract_text(cv_bytes, cv_mime_type)
    if not extraction.text.strip():
        return _unavailable(
            extraction.error or "Le CV n'a pas pu être lu (fichier illisible ou vide)."
        )

    result = analyze_job_match_llm(offer_text, extraction.text)
    if result is None:
        return _unavailable("Analyse momentanément indisponible. Réessayez plus tard.")

    return JobMatchAnalysis(available=True, **result)
