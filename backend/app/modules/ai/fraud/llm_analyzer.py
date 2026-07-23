"""Contextual forensic analysis — Agent C4, Layer 2 (optional).

Ported from the contribution's `llm_analyzer.py`. Sends the extracted metadata
and the deterministic signals to Mistral for a contextual verdict — catching
inconsistencies rigid rules cannot, such as a recent editing tool on an old
document, or an author/producer pairing that makes no sense for an official form.

Two changes from the original, to fit the project:
  * HTTP via `httpx` on the chat-completions endpoint, not the `mistralai` SDK —
    the same client the coherence and classification modules use, so no new
    dependency and one place to configure Mistral.
  * A single robust parse with graceful degradation, in place of the original's
    lenient regex parser. `response_format=json_object` makes strict JSON the
    norm; anything else degrades to a stated `INCONNU`, never a fabricated verdict.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import httpx

from app.core.config import settings
from app.core.logger import logger

_RISK_LEVELS = {"FAIBLE", "MODÉRÉ", "ÉLEVÉ", "CRITIQUE"}
_TIMEOUT_S = 45.0

_SYSTEM_PROMPT = (
    "Tu es un expert forensique spécialisé dans l'analyse de métadonnées documentaires "
    "pour la détection de falsifications. Tu réponds toujours en JSON valide uniquement, "
    "sans aucun texte supplémentaire avant ou après."
)


def is_llm_available() -> bool:
    return bool(settings.mistral_api_key)


def _build_prompt(metadata: dict[str, Any], signals: list[str]) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    summary = {k: v for k, v in metadata.items() if k != "metadonnees_brutes" and v is not None}

    return f"""Tu es un expert en analyse forensique de documents. Analyse les métadonnées d'un document numérique pour détecter tout signal d'incohérence, de manipulation ou de falsification potentielle.

Date et heure actuelles de l'analyse : {now}

--- MÉTADONNÉES DU DOCUMENT ---
{json.dumps(summary, indent=2, ensure_ascii=False, default=str)}

--- MÉTADONNÉES BRUTES ---
{json.dumps(metadata.get("metadonnees_brutes", {}), indent=2, ensure_ascii=False, default=str)}

--- SIGNAUX DÉTERMINISTES DÉJÀ DÉTECTÉS ---
{json.dumps(signals, indent=2, ensure_ascii=False) if signals else "Aucun signal déterministe détecté."}

--- MISSION ---
Va au-delà des règles déterministes. Cherche des incohérences subtiles : cohérence globale entre les champs (logiciel, auteur, dates, titre), plausibilité contextuelle, combinaisons contradictoires, informations manquantes attendues.

Réponds UNIQUEMENT avec un objet JSON valide de cette structure exacte :
{{
  "niveau_risque": "FAIBLE | MODÉRÉ | ÉLEVÉ | CRITIQUE",
  "verdict": "Résumé en une phrase du niveau de confiance dans l'authenticité",
  "signaux_llm": ["signal 1", "signal 2"],
  "analyse_llm": "Analyse contextuelle détaillée en français.",
  "recommandation": "Action concrète recommandée pour l'analyste."
}}"""


def _degraded(reason: str) -> dict[str, Any]:
    return {
        "niveau_risque": "INCONNU",
        "verdict": reason,
        "signaux_llm": [],
        "analyse_llm": reason,
        "recommandation": "Vérifiez manuellement les métadonnées.",
    }


def analyze_with_mistral(metadata: dict[str, Any], signals: list[str]) -> dict[str, Any] | None:
    """Forensic verdict from Mistral. Returns None when the key is absent; a
    degraded dict on any failure. Never raises."""
    if not is_llm_available():
        return None

    try:
        response = httpx.post(
            settings.mistral_api_url,
            headers={
                "Authorization": f"Bearer {settings.mistral_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.mistral_fraud_model,
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": _build_prompt(metadata, signals)},
                ],
            },
            timeout=_TIMEOUT_S,
        )
        response.raise_for_status()
        result = json.loads(response.json()["choices"][0]["message"]["content"])
    except Exception as exc:  # noqa: BLE001 — any failure degrades, never raises
        logger.error("Analyse forensique LLM impossible", {"error": str(exc)})
        return _degraded(f"Analyse LLM indisponible : {exc}")

    risk = result.get("niveau_risque")
    signaux = result.get("signaux_llm", [])
    return {
        "niveau_risque": risk if risk in _RISK_LEVELS else "INCONNU",
        "verdict": str(result.get("verdict", "")),
        "signaux_llm": [str(s) for s in signaux] if isinstance(signaux, list) else [],
        "analyse_llm": str(result.get("analyse_llm", "")),
        "recommandation": str(result.get("recommandation", "")),
    }
