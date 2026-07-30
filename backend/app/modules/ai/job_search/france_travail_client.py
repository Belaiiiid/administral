"""Thin client for France Travail's official "Offres d'emploi" API.

Real job listings only — this module never invents an offer. Every function
returns `None` on any failure (auth, network, unexpected shape); the caller
(`service.py`) turns that into `available: false`, never a fabricated result.

Two real endpoints, verified by hand against the live API:
  - token: https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire
  - search: https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search
"""

from __future__ import annotations

import time

import httpx

from app.core.config import settings
from app.core.logger import logger

_TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token"
_SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search"
_SCOPE = "api_offresdemploiv2 o2dsoffre"

# Module-level cache: one token shared across requests, like the lazy
# singletons elsewhere in this codebase (e.g. `chatbot/service.py`'s `_graph`).
# Tokens last ~1499s server-side; refetch a little before that to be safe.
_token: str | None = None
_token_expires_at: float = 0.0


def _get_access_token() -> str | None:
    global _token, _token_expires_at

    if _token is not None and time.monotonic() < _token_expires_at:
        return _token

    if not settings.france_travail_client_id or not settings.france_travail_client_secret:
        logger.warn("Recherche d'offres hors ligne : identifiants France Travail absents")
        return None

    try:
        response = httpx.post(
            _TOKEN_URL,
            params={"realm": "/partenaire"},
            data={
                "grant_type": "client_credentials",
                "client_id": settings.france_travail_client_id,
                "client_secret": settings.france_travail_client_secret,
                "scope": _SCOPE,
            },
            timeout=15.0,
        )
        response.raise_for_status()
        payload = response.json()
        _token = payload["access_token"]
        # Refresh 60s early rather than racing the exact expiry.
        _token_expires_at = time.monotonic() + max(payload.get("expires_in", 0) - 60, 0)
        return _token

    except Exception as exc:  # noqa: BLE001 — any failure degrades, never raises
        logger.error("France Travail : authentification impossible", {"error": str(exc)})
        return None


def search_offers(
    mots_cles: str,
    *,
    departement: str | None = None,
    type_contrat: str | None = None,
) -> list[dict] | None:
    """Real, currently-open offers matching the given criteria.

    Returns `[]` for a genuine "no results" (a successful call, nothing
    matched) — distinct from `None`, which means the call itself failed.
    Capped at 10 results (`range=0-9`): enough to give a citizen real
    choices without over-fetching for a one-shot search.
    """
    token = _get_access_token()
    if token is None:
        return None

    params: dict[str, str] = {"motsCles": mots_cles, "range": "0-9"}
    if departement:
        params["departement"] = departement
    if type_contrat:
        params["typeContrat"] = type_contrat

    try:
        response = httpx.get(
            _SEARCH_URL,
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=15.0,
        )
        # 206 = a partial result set (more offers exist than `range` asked
        # for) — still a real, successful response, not an error.
        if response.status_code not in (200, 206):
            raise httpx.HTTPStatusError(
                f"Unexpected status {response.status_code}", request=response.request, response=response
            )

        return response.json().get("resultats", [])

    except Exception as exc:  # noqa: BLE001 — any failure degrades, never raises
        logger.error("France Travail : recherche d'offres impossible", {"error": str(exc)})
        return None
