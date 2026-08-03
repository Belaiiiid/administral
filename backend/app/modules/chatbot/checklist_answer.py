"""Pont entre le profilage conversationnel de l'assistant et la vraie checklist.

Le moteur RAG migré traite l'intention `documents_necessaires` en posant des
questions de profilage structurées (popup à choix), puis — dans le repo d'origine
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
- **Le LLM ne décide pas des documents.** Depuis le passage à un entretien
  déterministe (`rag.profilage_documents`), il n'en collecte même plus les faits :
  la correspondance situation → documents reste dans les règles MonParcours, et
  les faits viennent de boutons. Un champ inconnu ou une valeur hors vocabulaire
  est ignoré plutôt que de faire échouer la réponse : un profil vide donne le
  socle commun.

TENIR L'ENTRETIEN COURT SANS PERDRE DE PIÈCES. L'entretien s'arrête à quatre
questions, ce qui laisse forcément des champs sans réponse. Les pièces qui en
dépendent ne sont pas abandonnées pour autant : elles sont rendues en fin de liste
sous « selon votre situation », chacune avec sa condition. Le citoyen s'y
reconnaît d'un coup d'œil, là où chaque champ supplémentaire aurait coûté une
question à tout le monde pour ne servir qu'à une minorité.
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


#: Les pièces qu'on ne demande PAS en question, et la condition qui les déclenche.
#:
#: Chaque entrée dit : « si ce champ valait ceci, quelles pièces s'ajouteraient ? ». La
#: réponse n'est pas écrite ici — elle est OBTENUE en rejouant les règles sur un profil
#: hypothétique. Les libellés et les justifications restent donc à un seul endroit
#: (`checklist_rules`) : recopier ici « justificatif de pension alimentaire » créerait
#: une seconde source de vérité qui divergerait au premier changement de règle.
#:
#: `a_lieu_detre` porte DEUX conditions à la fois : que le champ soit encore inconnu, et
#: que l'hypothèse ait un sens pour cette personne — inutile de parler des revenus du
#: conjoint à quelqu'un qui vient de dire vivre seul. Les deux sont écrites ensemble
#: plutôt que l'une en garde générique, parce que « encore inconnu » ne veut pas dire
#: « vide » : un foyer déclaré « en couple » vaut `concubinage`, qui dit justement que le
#: mariage ou le PACS n'est PAS établi. C'est exactement le cas que la ligne vise.
_CONDITIONS_NON_DEMANDEES: tuple[tuple[str, object, str, object], ...] = (
    (
        "percoit_pension_alimentaire", True,
        "si vous percevez une pension alimentaire",
        lambda p: p.percoit_pension_alimentaire is None and p.a_des_enfants_a_charge is not False,
    ),
    (
        "statut_professionnel_conjoint", StatutProfessionnel.salarie,
        "si vous vivez en couple",
        lambda p: (p.statut_professionnel_conjoint is None
                   and p.statut_marital is not StatutMarital.celibataire),
    ),
    (
        "statut_marital", StatutMarital.marie,
        "si vous êtes marié(e) ou pacsé(e)",
        lambda p: p.statut_marital in (None, StatutMarital.concubinage),
    ),
    (
        "est_boursier", True,
        "si vous êtes boursier(ère)",
        lambda p: p.est_boursier is None and p.statut_professionnel is StatutProfessionnel.etudiant,
    ),
    (
        "percoit_are", True,
        "si vous percevez l’allocation chômage (ARE)",
        lambda p: (p.percoit_are is None
                   and p.statut_professionnel is StatutProfessionnel.demandeur_emploi),
    ),
)


def _pieces_conditionnelles(profil: ProfilPartiel, deja_listees: set[str]) -> list[tuple[str, str]]:
    """Les pièces que le profil ne permet pas de trancher, avec leur condition.

    Obtenues en rejouant les règles DÉTERMINISTES sur un profil hypothétique et en
    gardant ce qui apparaît en plus. On n'appelle pas `generate_checklist` ici : sa
    sélection Mistral coûterait un appel par hypothèse pour un résultat qui doit
    justement être stable et explicable."""
    from app.modules.citizen.checklist_rules import generate_personalized_checklist

    conditionnelles: list[tuple[str, str]] = []
    vues = set(deja_listees)
    for champ, valeur, condition, a_lieu_detre in _CONDITIONS_NON_DEMANDEES:
        if not a_lieu_detre(profil):
            continue
        hypothese = profil.model_copy(update={champ: valeur})
        for item in generate_personalized_checklist(hypothese):
            if item.item_key not in vues:
                vues.add(item.item_key)
                conditionnelles.append((item.libelle, condition))
    return conditionnelles


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

    # Ce que l'entretien n'a pas demandé : au citoyen de se reconnaître. C'est le prix
    # assumé d'un entretien court, et il est payé ici plutôt qu'en questions.
    conditionnelles = _pieces_conditionnelles(profil, {item.item_key for item in items})
    if conditionnelles:
        lines.append("")
        lines.append("Selon votre situation, ajoutez aussi :")
        for libelle, condition in conditionnelles:
            lines.append(f"• {libelle} — {condition}.")

    lines.append("")
    lines.append(_CLOTURE_SOCLE_COMMUN if profil_vide else _CLOTURE_PERSONNALISEE)
    return "\n".join(lines)
