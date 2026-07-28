"""Mistral-backed checklist selection, grounded in a fixed, known-good catalog.

This is the "B1 node" the rest of the codebase names as unbuilt
(`citizen/checklist.py`, `citizen/checklist_rules.py`): a citizen's profile is
sent to Mistral so it can pick the documents *this* situation requires,
including combinations the deterministic if/elif tree in `checklist_rules.py`
does not reason about as well (several conditions at once, an ambiguous or
free-text field).

The one rule that makes this safe to call "grounded in reliable sources"
rather than an open invitation to hallucinate: **Mistral never invents a
document.** It only ever selects `item_key`s from `_known_catalog()` — the
same, already-curated set `checklist_rules.py` can produce, itself grounded in
the real APL requirements (service-public.fr / CAF), derived by exhaustively
unioning the deterministic generator's output rather than hand-duplicated (so
the two can never silently drift apart). Any key the model returns that is not
in that catalog is dropped; if that leaves the response empty or malformed in
any way, the caller (`service.generate_checklist`) falls back to the pure
deterministic generator — exactly the same "never invent, never crash"
contract every other Mistral-calling module in this project already follows
(`citizen/classification.py`, `ai/coherence/mistral_client.py`,
`ai/fraud/llm_analyzer.py`).
"""

from __future__ import annotations

import json
from functools import lru_cache

import httpx

from app.core.config import settings
from app.core.logger import logger
from app.modules.profiling.schemas.profil import (
    ProfilPartiel,
    StatutLogement,
    StatutMarital,
    StatutProfessionnel,
    TypeLocation,
)
from app.modules.citizen.checklist import ChecklistTemplate
from app.modules.citizen.checklist_rules import generate_personalized_checklist

_REQUEST_TIMEOUT_S = 30.0

#: Required of every applicant regardless of what the model returns — forced
#: in after the fact rather than trusted to the model's memory, so a document
#: that must always be present can never be silently dropped by an omission.
_ALWAYS_REQUIRED_KEYS = frozenset(
    {"piece_identite", "justificatif_domicile", "avis_imposition", "releve_identite_bancaire"}
)

#: Synthetic profiles chosen to collectively trigger every branch in
#: `generate_personalized_checklist` at least once. Deliberately redundant
#: with itself: the catalog is the *union* of their outputs, so covering a
#: branch twice from two profiles costs nothing and missing one loses an
#: entire document from what Mistral is allowed to select.
_CATALOG_PROFILES: tuple[ProfilPartiel, ...] = (
    ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        statut_professionnel=StatutProfessionnel.salarie,
        statut_marital=StatutMarital.marie,
        a_des_enfants_a_charge=True,
        percoit_pension_alimentaire=True,
        statut_professionnel_conjoint=StatutProfessionnel.salarie,
    ),
    ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.residence_etudiante,
        statut_professionnel=StatutProfessionnel.etudiant,
        est_boursier=True,
    ),
    ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.sous_location,
        statut_professionnel=StatutProfessionnel.demandeur_emploi,
        percoit_are=True,
    ),
    ProfilPartiel(
        situation_logement=StatutLogement.proprietaire,
        statut_professionnel=StatutProfessionnel.apprenti_alternant,
    ),
    ProfilPartiel(
        situation_logement=StatutLogement.heberge,
        statut_professionnel=StatutProfessionnel.independant,
    ),
)


@lru_cache(maxsize=1)
def _known_catalog() -> dict[str, ChecklistTemplate]:
    """Every document the deterministic rules can ever produce, keyed by id.

    Computed from the rules themselves — not hand-duplicated — so this catalog
    and `checklist_rules.py` cannot drift apart. Cached: it is pure and the
    same five profiles always produce the same union.
    """
    catalog: dict[str, ChecklistTemplate] = {}
    for profil in _CATALOG_PROFILES:
        for item in generate_personalized_checklist(profil):
            catalog.setdefault(item.item_key, item)
    return catalog


def _build_system_prompt(catalog: dict[str, ChecklistTemplate]) -> str:
    reference = [
        {
            "id": item.item_key,
            "libelle": item.libelle,
            "categorie": item.categorie.value,
            "quand_le_demander": item.justification,
        }
        for item in catalog.values()
    ]
    return (
        "Tu es l'agent CAF chargé de sélectionner les documents à fournir pour un "
        "dossier d'aide au logement (APL) et prestations associées, à partir du "
        "profil déclaré d'un citoyen.\n\n"
        "RÈGLE ABSOLUE : tu ne dois QUE sélectionner des identifiants dans la liste "
        "ci-dessous — cette liste est le référentiel officiel des pièces reconnues par "
        "la CAF pour ce projet. Tu ne dois jamais inventer un document ou un "
        "identifiant qui n'y figure pas, même si tu penses qu'il serait pertinent.\n\n"
        f"Référentiel des pièces reconnues :\n{json.dumps(reference, ensure_ascii=False, indent=2)}\n\n"
        "Réponds UNIQUEMENT avec un objet JSON de cette forme, sans texte avant ou "
        'après, sans balises markdown : {"item_keys": ["id1", "id2", ...]}\n'
        "Inclus un identifiant si et seulement si la situation décrite dans le profil "
        "le justifie d'après sa description ci-dessus."
    )


def _build_user_prompt(profil: ProfilPartiel) -> str:
    return (
        "Voici le profil déclaré du citoyen (JSON), avec des champs éventuellement "
        "absents (non renseignés) :\n\n"
        f"{json.dumps(profil.model_dump(mode='json', exclude_none=True), ensure_ascii=False, indent=2)}"
    )


def select_checklist_items(profil: ProfilPartiel) -> tuple[ChecklistTemplate, ...] | None:
    """Ask Mistral which known documents this profile requires.

    Returns ``None`` on any failure or invalid/empty output — the caller
    degrades to the deterministic generator. Never raises.
    """
    if not settings.mistral_api_key:
        return None

    catalog = _known_catalog()

    try:
        response = httpx.post(
            settings.mistral_api_url,
            headers={
                "Authorization": f"Bearer {settings.mistral_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.mistral_model,
                "messages": [
                    {"role": "system", "content": _build_system_prompt(catalog)},
                    {"role": "user", "content": _build_user_prompt(profil)},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.1,
            },
            timeout=_REQUEST_TIMEOUT_S,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        raw_keys = json.loads(content).get("item_keys")

        if not isinstance(raw_keys, list):
            raise ValueError("Réponse LLM sans liste `item_keys`.")

        # Grounding enforced here: anything not in the catalog is silently
        # dropped, never trusted. The always-required core is added back
        # regardless of what the model returned or omitted.
        selected_keys = {k for k in raw_keys if isinstance(k, str) and k in catalog}
        selected_keys |= _ALWAYS_REQUIRED_KEYS

        if not selected_keys:
            raise ValueError("Aucun identifiant reconnu dans la réponse LLM.")

        # Catalog order, not the model's order — stable and matching the
        # deterministic generator's own display convention.
        return tuple(item for key, item in catalog.items() if key in selected_keys)

    except Exception as exc:  # noqa: BLE001 — any failure degrades, never raises
        logger.warn("Sélection de checklist par Mistral impossible", {"error": str(exc)})
        return None
