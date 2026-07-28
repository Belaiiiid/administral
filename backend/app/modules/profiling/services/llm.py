"""
Interface LLM pour l'agent de profilage (A3).

Comportement (cf. brief bug n°2 — audit de l'appel Mistral) :

- Si `MISTRAL_API_KEY` est renseignée, **chaque tour** de la boucle déclenche
  un appel HTTP réel à https://api.mistral.ai. Un log explicite est émis
  (modèle, taille du prompt, latence, statut HTTP, début de réponse) pour
  qu'on puisse vérifier concrètement, en observant les logs backend, que le
  modèle répond bien à partir du contexte fourni et non d'un mock.
- Si la clé N'EST PAS renseignée, on ne bascule sur le fallback déterministe
  que si `APL_ALLOW_FALLBACK=true` est explicitement positionné. Sinon on
  lève une erreur claire — fini le fallback silencieux.

Le prompt système ci-dessous encode directement la cascade métier (statut
socio-professionnel → situation familiale → logement), fournie explicitement
par l'utilisateur. C'est ce texte qui est envoyé à Mistral à CHAQUE tour, avec
l'intégralité du profil_partiel courant ET l'historique des questions déjà
posées (cf. bug n°1 : incohérences dues à un contexte partiel) — voir
`_appeler_mistral` : les deux sont toujours inclus dans le message utilisateur.
"""
from __future__ import annotations

import json
import logging
import time

import httpx

from app.core.config import settings
from app.modules.profiling.services.completude import champs_manquants
from app.modules.profiling.schemas.profil import (
    CHAMPS_PROFILAGE,
    ProfilPartiel,
    StatutLogement,
    StatutMarital,
    StatutProfessionnel,
)

logger = logging.getLogger("apl.llm")


# Configuration read through the single application settings home
# (`app.core.config`) rather than a bare `os.getenv`, so the `.env` file is
# picked up the same way as every other Civique module. Behaviour is unchanged:
# an empty key still means "no key".
MISTRAL_API_KEY = (settings.mistral_api_key or "").strip() or None
MISTRAL_MODEL = settings.mistral_model
MISTRAL_API_URL = settings.mistral_api_url

# Ce projet utilise UNIQUEMENT l'API Mistral : le fallback déterministe est
# désactivé par défaut (chaque tour doit appeler Mistral ; une clé absente lève
# une erreur claire plutôt que de servir silencieusement une réponse de règles).
# Réactivable explicitement via `MISTRAL_ALLOW_FALLBACK=true` (dev hors ligne, tests).
ALLOW_FALLBACK = settings.mistral_allow_fallback


# ---------------------------------------------------------------------------
# Prompt système — fourni explicitement par l'utilisateur (cascade métier).
# Le bloc FORMAT DE SORTIE est complété par la liste réelle des champs valides
# du schéma Pydantic, pour que le contrat structurel (validé par TourAgent)
# reste garanti même si le LLM ne connaît pas nos noms de champs internes.
# ---------------------------------------------------------------------------
SYSTEM_PROMPT_TEMPLATE = """Tu es un agent expert de la CAF française spécialisé dans les Aides Personnalisées au Logement (APL).
Ton rôle n'est PAS de discuter, mais d'agir comme le "cerveau" d'un formulaire dynamique en ligne.

A chaque tour, tu vas recevoir un JSON représentant le profil actuel du citoyen avec les champs qu'il a déjà remplis, ainsi que l'historique des questions déjà posées dans cette session.
Ta mission est d'analyser ce profil, de trouver la prochaine information manquante cruciale selon les règles métier, et de générer le prochain champ du formulaire.

RÈGLES MÉTIER À APPLIQUER (Logique en cascade) :
1. Catégories Socio-Professionnelles (Le Statut) — champ `statut_professionnel` :
   - Si "Étudiant" : Demander s'il est boursier (`est_boursier`). Si Boursier = Oui, demander le montant de la bourse (`montant_bourse`).
   - Si "Apprenti / Alternant" ou "Salarié" : Demander les revenus nets mensuels (`revenus_nets_mensuels`), puis au tour suivant le type de contrat (`type_contrat`).
   - Si "Demandeur d'emploi" : Demander s'il perçoit l'ARE (`percoit_are`), et si oui, le montant (`montant_are_mensuel`).
   - Si "Indépendant" : Demander le Chiffre d'Affaires de l'année précédente (`chiffre_affaires_annuel`).

2. Catégories Familiales (Le Foyer) :
   - Pour tout profil : Déterminer la composition familiale (`statut_marital` : célibataire ou en couple — marié/pacsé/concubinage).
   - Si "En couple" : Demander le statut professionnel (`statut_professionnel_conjoint`), puis au tour suivant les revenus (`revenus_conjoint_mensuels`) du conjoint.
   - Pour tout profil : demander d'abord le gate « avez-vous des enfants à charge ? » (`a_des_enfants_a_charge`). Demander leur nombre (`nombre_enfants_a_charge`) seulement si la réponse est oui.
   - Si nombre d'enfants à charge > 0 : demander leur(s) âge(s) (`ages_enfants`), puis si une pension alimentaire est perçue (`percoit_pension_alimentaire`) — si oui, son montant (`montant_pension_alimentaire`).

3. Catégories d'Hébergement (Le Logement) — champ `situation_logement` puis `type_location` :
   - Si "Locataire" (type_location = vide/meublee/chambre) : Demander le loyer hors charges (`loyer_mensuel`) et si le logement est conventionné/HLM (`logement_conventionne`).
   - Si "Colocataire" (type_location = colocation) : Demander la PART de loyer payée personnellement (`loyer_mensuel` — jamais le loyer total du logement).
   - Si "Sous-locataire" (type_location = sous_location) : Vérifier l'âge (`moins_de_30_ans`, condition < 30 ans sauf hébergement familial) et si la sous-location est déclarée (`sous_location_declaree`).
   - Si "Foyer / Résidence" (type_location = residence_etudiante) : Demander le type exact — CROUS, EHPAD, résidence privée (`type_residence_detail`) — et la redevance mensuelle (`redevance_mensuelle`).
   - Motif d'exclusion à respecter : ne JAMAIS poser de question sur le logement si `situation_logement` est déjà "proprietaire" ou "heberge" (occupant/hébergé à titre gratuit ne sont pas éligibles à l'APL locative) — dans ce cas, il n'y a plus rien à demander sur le logement.

INSTRUCTIONS STRICTES :
1. Ne pose qu'UNE SEULE QUESTION (un seul champ) à la fois.
2. Tout gate oui/non doit être explicitement renseigné avant sa question de détail. Ne jamais déduire une valeur par défaut.
3. Ne repose JAMAIS une question dont le champ est déjà renseigné dans le profil reçu.
4. Si tu estimes avoir toutes les informations nécessaires selon la cascade ci-dessus (Statut + Foyer + Logement + Ressources pertinentes), tu dois déclarer le profil COMPLET (`prochaine_action = "profil_complet"`).
5. Le champ technique `champ_cible` doit être EXACTEMENT l'un des noms suivants (aucun autre nom n'est accepté) : {champs}.
6. Ton format de sortie doit obligatoirement être un JSON valide, sans aucun texte autour, respectant cette structure :

{{
  "prochaine_action": "poser_question" ou "profil_complet",
  "champ_cible": "le_nom_du_champ_technique_a_remplir",
  "question": "Le label de la question à afficher à l'utilisateur",
  "type_reponse": "texte_libre" ou "choix_multiple",
  "options": ["Option 1", "Option 2"] (si type_reponse est choix_multiple, sinon null),
  "regle_justifiant_la_question": "L'explication courte de pourquoi ce champ est requis"
}}
"""


class LLMError(Exception):
    """Erreur non récupérable lors de l'appel LLM ou du fallback interdit."""


async def generer_tour(profil: ProfilPartiel, historique: list[dict]) -> tuple[dict, str]:
    """Retourne (JSON brut proposé par le LLM, source utilisée).

    `source` vaut `"llm"` si Mistral a effectivement répondu, `"fallback"` si
    le générateur de règles a pris le relais (autorisé uniquement quand
    `APL_ALLOW_FALLBACK=true` — sinon on lève LLMError plutôt que de mentir).
    """
    if MISTRAL_API_KEY:
        return await _appeler_mistral(profil, historique), "llm"

    if not ALLOW_FALLBACK:
        raise LLMError(
            "MISTRAL_API_KEY absent et APL_ALLOW_FALLBACK=false : refuse de servir "
            "silencieusement une réponse déterministe. Renseignez la clé ou activez "
            "explicitement APL_ALLOW_FALLBACK=true."
        )

    logger.warning(
        "MISTRAL_API_KEY absent → utilisation du fallback déterministe (autorisé "
        "explicitement par APL_ALLOW_FALLBACK=true)."
    )
    return _regle_deterministe(profil, historique), "fallback"


async def _appeler_mistral(profil: ProfilPartiel, historique: list[dict]) -> dict:
    prompt_systeme = SYSTEM_PROMPT_TEMPLATE.format(champs=", ".join(CHAMPS_PROFILAGE))

    contexte_utilisateur = {
        "profil_partiel": profil.model_dump(exclude_none=True, mode="json"),
        "historique_questions": historique,
    }
    messages = [
        {"role": "system", "content": prompt_systeme},
        {"role": "user", "content": json.dumps(contexte_utilisateur, ensure_ascii=False)},
    ]

    payload = {
        "model": MISTRAL_MODEL,
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
    }

    logger.info(
        "→ Appel Mistral | modèle=%s | profil_champs_renseignés=%d | historique=%d tours | "
        "taille_prompt≈%d chars",
        MISTRAL_MODEL,
        sum(1 for v in contexte_utilisateur["profil_partiel"].values() if v is not None),
        len(historique),
        len(prompt_systeme) + len(messages[1]["content"]),
    )

    debut = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                MISTRAL_API_URL,
                headers={
                    "Authorization": f"Bearer {MISTRAL_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.HTTPError as exc:
        logger.error(
            "✗ Mistral inatteignable après %.0f ms : %s",
            (time.perf_counter() - debut) * 1000,
            exc,
        )
        raise LLMError(f"Mistral inatteignable: {exc}") from exc

    latence_ms = (time.perf_counter() - debut) * 1000

    if resp.status_code >= 400:
        logger.error(
            "✗ Mistral HTTP %d après %.0f ms : %s",
            resp.status_code,
            latence_ms,
            resp.text[:300],
        )
        raise LLMError(f"Mistral API error {resp.status_code}: {resp.text}")

    data = resp.json()
    contenu_brut = data["choices"][0]["message"]["content"]

    logger.info(
        "← Mistral OK | HTTP %d | %.0f ms | tokens_in=%s tokens_out=%s | réponse=%s",
        resp.status_code,
        latence_ms,
        data.get("usage", {}).get("prompt_tokens", "?"),
        data.get("usage", {}).get("completion_tokens", "?"),
        contenu_brut[:200].replace("\n", " "),
    )

    try:
        return json.loads(contenu_brut)
    except json.JSONDecodeError as exc:
        raise LLMError(f"Réponse LLM non-JSON: {contenu_brut!r}") from exc


# ---------------------------------------------------------------------------
# Fallback déterministe — n'est utilisé QUE si APL_ALLOW_FALLBACK=true.
# Reflète EXACTEMENT la même cascade métier que le prompt système ci-dessus,
# pour un comportement cohérent qu'on soit en mode Mistral ou en mode dev
# sans clé (bug n°1 : plus de question "enfants" incohérente posée à un
# profil qui ne s'y prête pas).
# ---------------------------------------------------------------------------

_QUESTIONS: list[dict] = [
    # --- 3. Logement ---
    {
        "champ_cible": "situation_logement",
        "question": "Quelle est votre situation par rapport à votre logement actuel ?",
        "type_reponse": "choix_multiple",
        "options": ["Locataire", "Propriétaire", "Hébergé(e) à titre gratuit"],
        "regle": "Détermine la branche Logement de la cascade.",
    },
    {
        "champ_cible": "type_location",
        "question": "Plus précisément, quel type de location occupez-vous ?",
        "type_reponse": "choix_multiple",
        "options": [
            "Location vide (non meublée)",
            "Location meublée",
            "Chambre",
            "Colocation",
            "Sous-location",
            "Foyer / Résidence (CROUS, EHPAD...)",
        ],
        "condition": lambda p: p.situation_logement == StatutLogement.locataire,
        "regle": "Sous-catégorie de logement — conditionne les champs suivants.",
    },
    {
        "champ_cible": "logement_appartient_a_un_proche",
        "question": "Votre propriétaire est-il un parent direct (père, mère, grand-parent, enfant) à vous ou à votre conjoint(e) ?",
        "type_reponse": "choix_multiple",
        "options": ["Oui", "Non"],
        "condition": lambda p: p.situation_logement == StatutLogement.locataire,
        "regle": "Motif d'exclusion légale F12006.",
    },
    {
        "champ_cible": "loyer_mensuel",
        "question": "Quel est le montant de votre loyer mensuel hors charges (en euros) ?",
        "type_reponse": "texte_libre",
        "condition": lambda p: p.situation_logement == StatutLogement.locataire
        and p.type_location
        not in (None, "sous_location", "residence_etudiante"),
        "regle": "Loyer requis pour locataire/colocataire (part payée pour un colocataire).",
    },
    {
        "champ_cible": "logement_conventionne",
        "question": "Votre logement est-il conventionné (HLM ou logement social) ?",
        "type_reponse": "choix_multiple",
        "options": ["Oui", "Non", "Je ne sais pas"],
        "condition": lambda p: p.situation_logement == StatutLogement.locataire
        and p.type_location
        not in (None, "sous_location", "residence_etudiante"),
        "regle": "Condition d'éligibilité pour un locataire classique.",
    },
    {
        "champ_cible": "moins_de_30_ans",
        "question": "Avez-vous moins de 30 ans ?",
        "type_reponse": "choix_multiple",
        "options": ["Oui", "Non"],
        "condition": lambda p: p.type_location is not None
        and p.type_location.value == "sous_location",
        "regle": "Condition d'éligibilité pour une sous-location déclarée.",
    },
    {
        "champ_cible": "sous_location_declaree",
        "question": "Cette sous-location est-elle déclarée à votre propriétaire ?",
        "type_reponse": "choix_multiple",
        "options": ["Oui", "Non"],
        "condition": lambda p: p.type_location is not None
        and p.type_location.value == "sous_location",
        "regle": "Condition d'éligibilité pour une sous-location.",
    },
    {
        "champ_cible": "type_residence_detail",
        "question": "De quel type de résidence s'agit-il exactement (CROUS, EHPAD, résidence privée conventionnée...) ?",
        "type_reponse": "texte_libre",
        "condition": lambda p: p.type_location is not None
        and p.type_location.value == "residence_etudiante",
        "regle": "Précise le cas foyer/résidence.",
    },
    {
        "champ_cible": "redevance_mensuelle",
        "question": "Quel est le montant de votre redevance mensuelle ?",
        "type_reponse": "texte_libre",
        "condition": lambda p: p.type_location is not None
        and p.type_location.value == "residence_etudiante",
        "regle": "La redevance remplace le loyer pour un foyer/résidence.",
    },
    # --- 2. Famille ---
    {
        "champ_cible": "statut_marital",
        "question": "Quelle est votre situation familiale ?",
        "type_reponse": "choix_multiple",
        "options": ["Célibataire", "Marié(e)", "Pacsé(e)", "En concubinage"],
        "regle": "Détermine si le foyer est célibataire ou en couple.",
    },
    {
        "champ_cible": "statut_professionnel_conjoint",
        "question": "Quel est le statut professionnel de votre conjoint(e) ?",
        "type_reponse": "choix_multiple",
        "options": ["Étudiant(e)", "Apprenti(e)/Alternant(e)", "Salarié(e)", "Demandeur d'emploi", "Indépendant(e)"],
        "condition": lambda p: p.statut_marital
        in (StatutMarital.marie, StatutMarital.pacse, StatutMarital.concubinage),
        "regle": "Un couple déclare les ressources des deux membres du foyer.",
    },
    {
        "champ_cible": "revenus_conjoint_mensuels",
        "question": "Quels sont les revenus nets mensuels de votre conjoint(e) ?",
        "type_reponse": "texte_libre",
        "condition": lambda p: p.statut_marital
        in (StatutMarital.marie, StatutMarital.pacse, StatutMarital.concubinage),
        "regle": "Ressources du conjoint requises pour un couple.",
    },
    {
        "champ_cible": "a_des_enfants_a_charge",
        "question": "Avez-vous des enfants à charge ?",
        "type_reponse": "choix_multiple",
        "options": ["Oui", "Non"],
        "regle": "Gate obligatoire avant de demander le nombre d'enfants.",
    },
    {
        "champ_cible": "nombre_enfants_a_charge",
        "question": "Combien d'enfants avez-vous à charge ?",
        "type_reponse": "texte_libre",
        "condition": lambda p: p.a_des_enfants_a_charge is True,
        "regle": "Demandé uniquement après confirmation explicite d'enfants à charge.",
    },
    {
        "champ_cible": "ages_enfants",
        "question": "Quel est l'âge de votre/vos enfant(s) à charge ?",
        "type_reponse": "texte_libre",
        "condition": lambda p: (p.nombre_enfants_a_charge or 0) > 0,
        "regle": "Uniquement si au moins un enfant à charge.",
    },
    {
        "champ_cible": "percoit_pension_alimentaire",
        "question": "Percevez-vous une pension alimentaire pour ce ou ces enfants ?",
        "type_reponse": "choix_multiple",
        "options": ["Oui", "Non"],
        "condition": lambda p: (p.nombre_enfants_a_charge or 0) > 0,
        "regle": "Uniquement si au moins un enfant à charge.",
    },
    {
        "champ_cible": "montant_pension_alimentaire",
        "question": "Quel est le montant mensuel de cette pension alimentaire ?",
        "type_reponse": "texte_libre",
        "condition": lambda p: p.percoit_pension_alimentaire is True,
        "regle": "Montant requis uniquement si une pension est perçue.",
    },
    # --- 1. Statut socio-professionnel ---
    {
        "champ_cible": "statut_professionnel",
        "question": "Quelle est votre situation professionnelle actuelle ?",
        "type_reponse": "choix_multiple",
        "options": ["Étudiant(e)", "Apprenti(e)/Alternant(e)", "Salarié(e)", "Demandeur d'emploi", "Indépendant(e)"],
        "regle": "Détermine la branche Ressources de la cascade.",
    },
    {
        "champ_cible": "est_boursier",
        "question": "Êtes-vous boursier(ère) sur critères sociaux (Crous ou bourse régionale) ?",
        "type_reponse": "choix_multiple",
        "options": ["Oui", "Non"],
        "condition": lambda p: p.statut_professionnel == StatutProfessionnel.etudiant,
        "regle": "Branche étudiant.",
    },
    {
        "champ_cible": "montant_bourse",
        "question": "Quel est le montant mensuel de votre bourse ?",
        "type_reponse": "texte_libre",
        "condition": lambda p: p.statut_professionnel == StatutProfessionnel.etudiant
        and p.est_boursier is True,
        "regle": "Uniquement si boursier.",
    },
    {
        "champ_cible": "type_contrat",
        "question": "Quel est votre type de contrat de travail ?",
        "type_reponse": "choix_multiple",
        "options": ["CDI", "CDD", "Contrat d'apprentissage", "Contrat de professionnalisation"],
        "condition": lambda p: p.statut_professionnel
        in (StatutProfessionnel.salarie, StatutProfessionnel.apprenti_alternant),
        "regle": "Branche salarié/apprenti.",
    },
    {
        "champ_cible": "revenus_nets_mensuels",
        "question": "Quels sont vos revenus nets mensuels ?",
        "type_reponse": "texte_libre",
        "condition": lambda p: p.statut_professionnel
        in (StatutProfessionnel.salarie, StatutProfessionnel.apprenti_alternant),
        "regle": "Branche salarié/apprenti.",
    },
    {
        "champ_cible": "percoit_are",
        "question": "Percevez-vous l'Allocation de Retour à l'Emploi (ARE) ?",
        "type_reponse": "choix_multiple",
        "options": ["Oui", "Non"],
        "condition": lambda p: p.statut_professionnel == StatutProfessionnel.demandeur_emploi,
        "regle": "Branche demandeur d'emploi.",
    },
    {
        "champ_cible": "montant_are_mensuel",
        "question": "Quel est le montant mensuel de votre ARE ?",
        "type_reponse": "texte_libre",
        "condition": lambda p: p.statut_professionnel == StatutProfessionnel.demandeur_emploi
        and p.percoit_are is True,
        "regle": "Uniquement si l'ARE est perçue.",
    },
    {
        "champ_cible": "chiffre_affaires_annuel",
        "question": "Quel a été votre chiffre d'affaires sur l'année précédente ?",
        "type_reponse": "texte_libre",
        "condition": lambda p: p.statut_professionnel == StatutProfessionnel.independant,
        "regle": "Branche indépendant.",
    },
    {
        "champ_cible": "ville",
        "question": "Dans quelle ville se situe votre logement ?",
        "type_reponse": "texte_libre",
        "regle": "Nécessaire pour déterminer la zone géographique du calcul APL.",
    },
]


def _regle_deterministe(profil: ProfilPartiel, historique: list[dict]) -> dict:
    # `champs_manquants` est la source de vérité déterministe de l'ordre
    # métier. L'historique est fourni au LLM pour le contexte, mais ne doit
    # jamais empêcher de reposer une question restée sans réponse.
    prochain = prochain_champ_attendu(profil)
    if prochain is not None:
        return prochain
    return {"prochaine_action": "profil_complet"}


def prochain_champ_attendu(profil: ProfilPartiel) -> dict | None:
    """Construit la seule question autorisée par la cascade pour ce profil."""
    questions_par_champ = {item["champ_cible"]: item for item in _QUESTIONS}
    for champ in champs_manquants(profil):
        item = questions_par_champ.get(champ)
        if item is None:
            continue
        condition = item.get("condition")
        if condition is not None and not condition(profil):
            continue
        return {
            "prochaine_action": "poser_question",
            "question": item["question"],
            "type_reponse": item["type_reponse"],
            "options": item.get("options"),
            "champ_cible": champ,
            "regle_justifiant_la_question": item.get("regle"),
        }
    return None
