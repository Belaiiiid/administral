"""Pont entre le profiling conversationnel de l'assistant et la vraie checklist.

Le moteur RAG migré traite l'intention `documents_necessaires` en posant des
questions de profiling structurées (popup à choix), puis — dans le repo d'origine
`apl_rag` — renvoie un `[MOCK]`, faute de générateur de checklist personnalisée.
MonParcours en a un, déjà écrit et testé : `ai.checklist.service.generate_checklist`
(sélection Mistral, avec `checklist_rules.generate_personalized_checklist`,
déterministe, en repli). Ce module est le seul point de raccord entre les deux.

Deux invariants tiennent ici :

- **Le profil est DÉCLARATIF, jamais authentifié.** Il vient uniquement des
  réponses données dans la conversation. Rien n'est lu depuis le compte connecté,
  le dossier ou un `citizen_id` — l'assistant se comporte de façon identique pour
  un citoyen connecté sur le portail web et pour un canal sans authentification
  (WhatsApp). Le module `citizen`/`submission` n'est pas sollicité.
- **Le LLM ne décide pas des documents.** Il ne fait que remplir des champs de
  profil ; la correspondance situation → documents reste dans les règles
  MonParcours. Un champ inconnu ou une valeur hors vocabulaire est ignoré plutôt
  que de faire échouer la réponse : un profil vide donne le socle commun.
"""

from __future__ import annotations

from app.modules.profiling.schemas.profil import (
    ProfilPartiel,
    StatutLogement,
    StatutMarital,
    StatutProfessionnel,
    TypeLocation,
)

#: Les seuls champs que le profiling de l'assistant cherche à remplir : ceux dont
#: `checklist_rules.generate_personalized_checklist` se sert réellement. Demander
#: davantage allongerait la conversation sans changer la liste de documents.
#: valeur = None pour un booléen, sinon l'énumération qui borne les valeurs.
PROFILE_FIELDS: dict[str, type | None] = {
    "situation_logement": StatutLogement,
    "type_location": TypeLocation,
    "statut_professionnel": StatutProfessionnel,
    "statut_professionnel_conjoint": StatutProfessionnel,
    "statut_marital": StatutMarital,
    "est_boursier": None,
    "percoit_are": None,
    "a_des_enfants_a_charge": None,
    "percoit_pension_alimentaire": None,
}


def _field_doc(name: str, enum_type: type | None, when: str) -> str:
    values = "true | false" if enum_type is None else " | ".join(e.value for e in enum_type)
    return f'- "{name}": {values}{when}'


#: Fragment de prompt décrivant le vocabulaire attendu, DÉRIVÉ des énumérations
#: plutôt que recopié : si `ProfilPartiel` gagne une valeur, le prompt suit.
PROFILE_FIELDS_DOC = "\n".join(
    [
        _field_doc("situation_logement", StatutLogement, ""),
        _field_doc("type_location", TypeLocation, " (seulement si locataire)"),
        _field_doc("statut_professionnel", StatutProfessionnel, ""),
        _field_doc("est_boursier", None, " (seulement si étudiant)"),
        _field_doc("percoit_are", None, " (seulement si demandeur d'emploi)"),
        _field_doc("statut_marital", StatutMarital, ""),
        _field_doc("a_des_enfants_a_charge", None, ""),
        _field_doc("percoit_pension_alimentaire", None, " (seulement si enfants à charge)"),
        _field_doc("statut_professionnel_conjoint", StatutProfessionnel, " (seulement si en couple)"),
    ]
)


def _coerce(name: str, value) -> object | None:
    """Convertit une valeur brute du LLM vers le type attendu, ou None si elle ne
    correspond à rien de connu. Tolérant en entrée, strict en sortie : mieux vaut
    un champ manquant (le socle commun s'applique) qu'un champ inventé."""
    enum_type = PROFILE_FIELDS[name]
    if value is None:
        return None
    if enum_type is None:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in ("true", "oui", "yes"):
                return True
            if lowered in ("false", "non", "no"):
                return False
        return None
    try:
        return enum_type(str(value).strip().lower())
    except ValueError:
        return None


def build_profil(raw: dict | None) -> ProfilPartiel:
    """Construit un `ProfilPartiel` à partir du dict renvoyé par le LLM de profiling.

    `ProfilPartiel` interdit les champs inconnus (`extra="forbid"`) et valide les
    types : on filtre donc en amont, pour qu'une hallucination de champ ne se
    transforme jamais en erreur 500. Un profil totalement vide est valide et
    donne la checklist socle (identité, domicile, avis d'imposition, RIB)."""
    if not isinstance(raw, dict):
        return ProfilPartiel()

    cleaned: dict[str, object] = {}
    for name in PROFILE_FIELDS:
        if name not in raw:
            continue
        coerced = _coerce(name, raw[name])
        if coerced is not None:
            cleaned[name] = coerced

    try:
        return ProfilPartiel(**cleaned)
    except Exception:  # noqa: BLE001 — un profil invalide dégrade vers le socle commun
        return ProfilPartiel()


#: Phrase de clôture quand le profiling a effectivement recueilli quelque chose.
_CLOTURE_PERSONNALISEE = (
    "Cette liste est établie à partir de ce que vous m’avez indiqué. Si votre "
    "situation change, elle peut évoluer."
)
#: Et quand il n'a rien recueilli. Le cas existe pour de bon : un citoyen qui passe
#: toutes les questions arrive ici avec un profil vide. Lui servir la même phrase
#: présenterait le socle commun comme une liste personnalisée — une liste générique
#: annoncée comme sur-mesure est plus trompeuse qu'une liste générique assumée.
_CLOTURE_SOCLE_COMMUN = (
    "Ce sont les pièces demandées dans tous les cas. Décrivez-moi votre situation "
    "(logement, activité, situation familiale) et je vous dirai ce qu’il faut y ajouter."
)


def render_checklist(raw_profile: dict | None, intro: str | None = None) -> str:
    """Texte final de l'intention `documents_necessaires` : la vraie checklist.

    Rendu en texte simple (une pièce par ligne, avec sa justification) car c'est
    ce que la bulle de conversation affiche. Les obligatoires d'abord, puis les
    pièces recommandées, chacune expliquée — la justification vient des règles,
    pas du modèle.

    N'est atteint QUE lorsque le profiling a abouti : un tour où le modèle n'a pas
    respecté son contrat n'arrive pas ici (voir `orchestrator.documents_necessaires_node`),
    sans quoi une panne se déguiserait en checklist personnalisée."""
    from app.modules.ai.checklist.service import generate_checklist

    profil = build_profil(raw_profile)
    profil_vide = not profil.model_dump(exclude_none=True)
    items = generate_checklist(profil)

    obligatoires = [item for item in items if item.obligatoire]
    recommandes = [item for item in items if not item.obligatoire]

    lines: list[str] = []
    if intro:
        lines.append(intro.strip())
        lines.append("")
    lines.append("Documents à fournir pour cette demande d’APL :")
    for item in obligatoires:
        lines.append(f"• {item.libelle} — {item.justification}")
    if recommandes:
        lines.append("")
        lines.append("Pièces recommandées (pas obligatoires) :")
        for item in recommandes:
            lines.append(f"• {item.libelle} — {item.justification}")
    lines.append("")
    lines.append(_CLOTURE_SOCLE_COMMUN if profil_vide else _CLOTURE_PERSONNALISEE)
    return "\n".join(lines)
