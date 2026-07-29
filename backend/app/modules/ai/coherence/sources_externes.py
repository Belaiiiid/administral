"""Optional, configured external referentials for coherence analysis.

No endpoint is hard-coded: a deployment explicitly opts in through the
``COHERENCE_*_URL`` settings.  A failed referential is represented as data so
the analyser can request review instead of treating an unavailable service as
documentary fraud.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import settings

_SOURCES = {
    "site_web": settings.coherence_site_web_url,
    "api_caf": settings.coherence_api_caf_url,
    "base_loyers": settings.coherence_base_loyers_url,
    "verification_cin": settings.coherence_verification_cin_url,
    "codes_postaux": settings.coherence_codes_postaux_url,
    "plafonds_revenus": settings.coherence_plafonds_revenus_url,
}


def _contexte_minimal(profil: dict, documents: list[dict]) -> dict:
    """Build a minimal query context; never send complete document text."""
    champs = {
        "nom": profil.get("nom"),
        "prenom": profil.get("prenom"),
        "date_naissance": profil.get("date_naissance"),
        "numero_cin": profil.get("numero_cin"),
        "adresse": profil.get("adresse"),
        "date_demande": profil.get("date_demande"),
    }
    return {cle: valeur for cle, valeur in champs.items() if valeur is not None}


def _consulter(nom: str, url: str, contexte: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    try:
        response = httpx.get(url, params=contexte, timeout=15.0)
        response.raise_for_status()
        try:
            donnees: Any = response.json()
        except ValueError:
            donnees = {"contenu": response.text[:12000]}
        return {
            "nom": nom,
            "url": url,
            "statut": "disponible",
            "date_consultation": now,
            "donnees": donnees,
        }
    except httpx.HTTPError as erreur:
        return {
            "nom": nom,
            "url": url,
            "statut": "indisponible",
            "date_consultation": now,
            "erreur": str(erreur),
        }


def consulter_sources_externes(profil: dict, documents: list[dict]) -> list[dict]:
    """Query only referentials explicitly enabled by the environment."""
    contexte = _contexte_minimal(profil, documents)
    return [
        _consulter(nom, url, contexte)
        for nom, url in _SOURCES.items()
        if url
    ]
