"""Contextual forensic analysis — Agent C4, Layer 2 (optional).

Ported from the contribution's `llm_analyzer.py`. Sends the extracted metadata,
the deterministic signals, and now the document's own page image(s) to Mistral
for a contextual verdict — catching inconsistencies rigid rules and pixel
forensics cannot, such as a recent editing tool on an old document, an
author/producer pairing that makes no sense for an official form, or a layout
that looks visually wrong for the document type even though no single
pixel-level detector flagged it.

The verdict now feeds the evidence fusion as its own detector (`llm_vision`
in `service.py`/`fusion_config.json`) instead of being purely decorative text,
so the prompt deliberately asks for an *independent* visual read rather than
a restatement of the deterministic signals already listed for context — that
list is there to inform the narrative explanation, not to be echoed back into
`niveau_risque`, which would double-count evidence already scored elsewhere.

Two changes from the original, to fit the project:
  * HTTP via `httpx` on the chat-completions endpoint, not the `mistralai` SDK —
    the same client the coherence and classification modules use, so no new
    dependency and one place to configure Mistral.
  * A single robust parse with graceful degradation, in place of the original's
    lenient regex parser. `response_format=json_object` makes strict JSON the
    norm; anything else degrades to a stated `INCONNU`, never a fabricated verdict.
"""

from __future__ import annotations

import base64
import json
from datetime import datetime
from pathlib import Path
from typing import Any

import cv2
import httpx

from app.core.config import settings
from app.core.logger import logger
from app.modules.ai.fraud.ela import _pages, _resize

_RISK_LEVELS = {"FAIBLE", "MODÉRÉ", "ÉLEVÉ", "CRITIQUE"}
_TIMEOUT_S = 60.0  # a vision request is slower than the text-only original
_MAX_PAGES_SENT = 2  # bounds request size/latency; administrative documents are almost always 1 page
_MAX_DIMENSION = 1600  # legible text at a reasonable payload size


def render_pages_for_llm(path: Path) -> list[str]:
    """Render up to the first `_MAX_PAGES_SENT` pages as `data:image/jpeg;base64,...` URIs.

    Returns an empty list if the document cannot be decoded as an image/PDF —
    the caller degrades to a metadata-only prompt rather than failing.
    """
    data_urls: list[str] = []
    for page in _pages(path)[:_MAX_PAGES_SENT]:
        image = _resize(page, maximum=_MAX_DIMENSION)
        ok, buffer = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if ok:
            data_urls.append("data:image/jpeg;base64," + base64.b64encode(buffer).decode("ascii"))
    return data_urls

_SYSTEM_PROMPT = (
    "Tu es un expert forensique spécialisé dans l'analyse visuelle et documentaire "
    "pour la détection de falsifications. Tu réponds toujours en JSON valide uniquement, "
    "sans aucun texte supplémentaire avant ou après."
)


def is_llm_available() -> bool:
    return bool(settings.mistral_api_key)


def _build_prompt(metadata: dict[str, Any], signals: list[str], *, has_image: bool) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    summary = {k: v for k, v in metadata.items() if k != "metadonnees_brutes" and v is not None}

    image_section = (
        "--- IMAGE DU DOCUMENT ---\n"
        "La ou les premières pages du document sont jointes à ce message. Examine leur mise en "
        "page, leur typographie, la cohérence visuelle avec un document officiel de ce type "
        "(logos, cadres, alignement des champs, qualité d'impression/scan)."
        if has_image
        else "--- IMAGE DU DOCUMENT ---\nAucune image exploitable n'a pu être jointe ; base ton "
        "analyse uniquement sur les métadonnées ci-dessous."
    )

    return f"""Tu es un expert en analyse forensique de documents. Analyse ce document pour détecter tout signal d'incohérence, de manipulation ou de falsification potentielle.

Date et heure actuelles de l'analyse : {now}

{image_section}

--- MÉTADONNÉES DU DOCUMENT ---
{json.dumps(summary, indent=2, ensure_ascii=False, default=str)}

--- MÉTADONNÉES BRUTES ---
{json.dumps(metadata.get("metadonnees_brutes", {}), indent=2, ensure_ascii=False, default=str)}

--- SIGNAUX DÉTERMINISTES DÉJÀ DÉTECTÉS PAR D'AUTRES CONTRÔLES (pour contexte uniquement) ---
{json.dumps(signals, indent=2, ensure_ascii=False) if signals else "Aucun signal déterministe détecté."}

--- MISSION ---
Les signaux déterministes ci-dessus sont déjà pris en compte ailleurs dans le score final : ne
les répète pas dans ton niveau de risque. Ton `niveau_risque` doit refléter UNIQUEMENT ce que TOI
tu observes en plus, de façon indépendante : l'aspect visuel du document (s'il est fourni) et des
incohérences contextuelles subtiles que les règles rigides ne couvrent pas (cohérence globale
entre les champs, plausibilité, combinaisons contradictoires, informations manquantes attendues).
Si tu n'as rien à ajouter au-delà des signaux déjà listés, réponds FAIBLE.

Réponds UNIQUEMENT avec un objet JSON valide de cette structure exacte :
{{
  "niveau_risque": "FAIBLE | MODÉRÉ | ÉLEVÉ | CRITIQUE",
  "verdict": "Résumé en une phrase du niveau de confiance dans l'authenticité",
  "signaux_llm": ["signal 1", "signal 2"],
  "analyse_llm": "Analyse contextuelle détaillée en français.",
  "recommandation": "Action concrète recommandée pour l'analyste."
}}"""


def _build_messages(metadata: dict[str, Any], signals: list[str], image_data_urls: list[str]) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = [{"type": "text", "text": _build_prompt(metadata, signals, has_image=bool(image_data_urls))}]
    # Mistral's vision format takes the data URI directly as the `image_url`
    # value (a string), unlike OpenAI's nested `{"url": ...}` object.
    content.extend({"type": "image_url", "image_url": data_url} for data_url in image_data_urls)
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": content},
    ]


def _degraded(reason: str) -> dict[str, Any]:
    return {
        "niveau_risque": "INCONNU",
        "verdict": reason,
        "signaux_llm": [],
        "analyse_llm": reason,
        "recommandation": "Vérifiez manuellement les métadonnées.",
    }


def analyze_with_mistral(
    metadata: dict[str, Any], signals: list[str], image_data_urls: list[str] | None = None
) -> dict[str, Any] | None:
    """Forensic verdict from Mistral. Returns None when the key is absent; a
    degraded dict on any failure. Never raises.

    `image_data_urls` are full `data:image/jpeg;base64,...` strings for the
    document's first page(s) — optional, since a page may fail to render.
    """
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
                "messages": _build_messages(metadata, signals, image_data_urls or []),
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
