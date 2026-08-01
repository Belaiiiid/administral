"""Job search — the entry point the router calls.

Deliberately different failure behaviour from `ai.job_match`/`ai.cv_coach`:
there, the AI judgment *is* the product, so its absence means nothing useful
to show. Here, the product is real job listings, which exist independently
of the scoring step — a scoring failure degrades to *unscored real offers*,
never to hiding them.
"""

from __future__ import annotations

from app.modules.ai.job_search import france_travail_client
from app.modules.ai.job_search.mistral_client import extract_search_criteria_llm, score_offers_llm
from app.modules.ai.job_search.schemas import JobOffer, JobSearchResult


def _unavailable(reason: str) -> JobSearchResult:
    return JobSearchResult(available=False, unavailable_reason=reason)


def _to_offer(raw: dict, scores: dict[str, dict] | None) -> JobOffer:
    offer_id = raw.get("id", "")
    score_info = (scores or {}).get(offer_id)
    return JobOffer(
        id=offer_id,
        intitule=raw.get("intitule", ""),
        entreprise=(raw.get("entreprise") or {}).get("nom"),
        lieu_libelle=(raw.get("lieuTravail") or {}).get("libelle"),
        type_contrat=raw.get("typeContratLibelle") or raw.get("typeContrat"),
        description=(raw.get("description") or "")[:300],
        url=(raw.get("origineOffre") or {}).get("urlOrigine"),
        score=score_info["score"] if score_info else None,
        raison=score_info["raison"] if score_info else None,
    )


def search_jobs(prompt: str) -> JobSearchResult:
    """Never raises — every failure degrades to a clean, honest result."""
    criteria = extract_search_criteria_llm(prompt)
    if criteria is None:
        return _unavailable("Analyse de la recherche indisponible. Réessayez plus tard.")

    raw_offers = france_travail_client.search_offers(
        criteria["mots_cles"],
        departement=criteria["departement"],
        type_contrat=criteria["type_contrat"],
    )
    if raw_offers is None:
        return _unavailable("Recherche d'offres indisponible pour le moment. Réessayez plus tard.")

    # A real "no results" — not an error, nothing to score.
    if not raw_offers:
        return JobSearchResult(
            available=True,
            mots_cles=criteria["mots_cles"],
            departement=criteria["departement"],
            offres=[],
        )

    scores = score_offers_llm(prompt, raw_offers)
    offers = [_to_offer(raw, scores) for raw in raw_offers]
    offers.sort(key=lambda o: (o.score is None, -(o.score or 0)))

    return JobSearchResult(
        available=True,
        mots_cles=criteria["mots_cles"],
        departement=criteria["departement"],
        offres=offers,
    )
