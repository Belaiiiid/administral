"""Le profilage « documents nécessaires », posé par le CODE et non par le modèle.

POURQUOI CE MODULE EXISTE. La version précédente confiait au LLM le soin de mener
l'entretien : quelles questions poser, dans quel ordre, et quand s'arrêter — la
consigne étant « pas plus de 4 questions, regarde l'historique pour savoir
combien tu en as déjà posées ». Cette consigne était inapplicable. Le client
tronque l'historique aux 6 derniers messages (`chatbotService.ts`), soit trois
échanges : passé la troisième question, le modèle voit en permanence deux ou
trois de ses propres questions et conclut à chaque fois qu'il lui reste de la
marge. La fenêtre glisse en même temps que la conversation grandit, si bien que
le compte vu n'augmente jamais et que le plafond n'est jamais atteint. Seul le
bouton « Passer cette question » sortait le citoyen de la boucle.

Le prompt se contredisait par ailleurs : neuf champs de profil à remplir, quatre
questions au maximum. Aucun modèle ne peut satisfaire les deux.

CE QUI REMPLACE. La liste des champs est connue et finie, donc le code peut mener
l'entretien lui-même — exactement comme `estimation_node` le fait déjà avec ses
quatre tranches. Le plafond n'est plus une consigne, c'est une propriété : on ne
peut pas poser une question qui n'est pas dans la liste.

QUATRE QUESTIONS, CHOISIES PAR VALEUR D'INFORMATION. Mesurée sur
`checklist_rules.generate_personalized_checklist`, qui seule décide des pièces :

  1. le logement    — ajoute toujours une pièce (bail, prêt, attestation)
  2. l'activité     — ajoute toujours une pièce (bulletins, certificat...)
  3. le foyer       — livret de famille, et ouvre la pension alimentaire
  4. UNE relance    — choisie d'après les réponses précédentes

Les champs restants (pension alimentaire, revenus du conjoint, bourse...) ne
valent pas une question : ils n'ajoutent qu'une pièce et ne concernent qu'une
minorité. Ils sont rendus en fin de liste sous « selon votre situation », où le
citoyen se reconnaît d'un coup d'œil — rien n'est perdu, et l'entretien reste
court (voir `checklist_answer.render_checklist`).

Le LLM ne disparaît pas de l'intention : il la RECONNAÎT toujours (le
classifieur). Il ne conduit simplement plus l'entretien.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional

from app.modules.profiling.schemas.profil import (
    StatutLogement,
    StatutMarital,
    StatutProfessionnel,
    TypeLocation,
)


@dataclass(frozen=True)
class Choix:
    """Un bouton de la question, et ce qu'il écrit dans le profil déclaré.

    `profil` est un fragment et non une valeur unique parce qu'une seule question
    peut renseigner deux champs : « seul(e), sans enfant » dit à la fois la
    situation maritale et l'absence d'enfant à charge."""

    libelle: str
    profil: dict
    #: Repères pour reconnaître une réponse TAPÉE ou DICTÉE plutôt que cliquée.
    #: Indispensable ici : l'assistant vocal renvoie une transcription (« je suis
    #: locataire »), qui ne sera jamais égale au libellé du bouton.
    mots_cles: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class Question:
    texte: str
    #: Réponse à « Je ne comprends pas, expliquez-moi ». Écrite ici parce que la
    #: question l'est aussi : on ne délègue pas au modèle l'explication d'une
    #: consigne du code (même principe que la question de date juridique).
    explication: str
    choix: tuple[Choix, ...]


QUESTIONS: dict[str, Question] = {
    "logement": Question(
        texte="Pour savoir quelles pièces vous concernent : quelle est votre situation de logement ?",
        explication=(
            "Il s'agit de savoir à quel titre vous occupez votre logement : vous payez "
            "un loyer (locataire), vous remboursez un prêt pour un logement qui vous "
            "appartient (propriétaire), ou vous êtes logé chez quelqu'un."
        ),
        choix=(
            Choix("Je suis locataire", {"situation_logement": StatutLogement.locataire.value},
                  ("locataire", "loyer", "louer", "bail")),
            Choix("Je suis propriétaire", {"situation_logement": StatutLogement.proprietaire.value},
                  ("proprietaire", "pret", "credit", "achete")),
            Choix("Je suis hébergé(e)", {"situation_logement": StatutLogement.heberge.value},
                  ("heberge", "loge", "chez mes parents", "chez un proche")),
        ),
    ),
    "activite": Question(
        texte="Quelle est votre situation professionnelle ?",
        explication=(
            "Votre activité détermine le justificatif de ressources demandé : des "
            "bulletins de salaire pour un salarié, un certificat de scolarité pour un "
            "étudiant, une attestation France Travail pour un demandeur d'emploi."
        ),
        choix=(
            Choix("Salarié(e)", {"statut_professionnel": StatutProfessionnel.salarie.value},
                  ("salarie", "salariee", "cdi", "cdd", "employe", "travaille")),
            Choix("Étudiant(e)", {"statut_professionnel": StatutProfessionnel.etudiant.value},
                  ("etudiant", "etudiante", "etudie", "fac", "universite", "ecole")),
            Choix("Apprenti(e) ou alternant(e)",
                  {"statut_professionnel": StatutProfessionnel.apprenti_alternant.value},
                  ("apprenti", "apprentie", "alternant", "alternance", "apprentissage")),
            Choix("Demandeur d'emploi",
                  {"statut_professionnel": StatutProfessionnel.demandeur_emploi.value},
                  ("demandeur", "chomage", "chomeur", "sans emploi", "france travail", "pole emploi")),
            Choix("Indépendant(e)", {"statut_professionnel": StatutProfessionnel.independant.value},
                  ("independant", "independante", "auto entrepreneur", "freelance", "liberal")),
        ),
    ),
    "foyer": Question(
        texte="Comment se compose votre foyer ?",
        explication=(
            "On entend par « enfant à charge » un enfant qui vit avec vous et dont vous "
            "assumez les frais. « En couple » vaut aussi bien pour un mariage ou un PACS "
            "que pour une vie commune sans formalité."
        ),
        choix=(
            # `celibataire` est écrit explicitement : c'est une information (pas de
            # conjoint), pas une absence de réponse.
            Choix("Seul(e), sans enfant à charge",
                  {"statut_marital": StatutMarital.celibataire.value,
                   "a_des_enfants_a_charge": False},
                  ("seul", "seule", "celibataire", "personne seule")),
            Choix("Seul(e), avec un ou des enfants à charge",
                  {"statut_marital": StatutMarital.celibataire.value,
                   "a_des_enfants_a_charge": True},
                  ("seul avec", "seule avec", "monoparental", "parent isole")),
            # `concubinage` = « en couple, sans que le mariage ou le PACS soit établi ».
            # C'est la seule valeur du vocabulaire qui n'affirme pas ce qu'on ignore : elle
            # n'ajoute par elle-même aucune pièce, et le cas marié/pacsé (livret de
            # famille) ressort en « selon votre situation ».
            Choix("En couple, sans enfant à charge",
                  {"statut_marital": StatutMarital.concubinage.value,
                   "a_des_enfants_a_charge": False},
                  ("en couple", "marie", "mariee", "pacse", "pacsee", "conjoint", "concubinage")),
            Choix("En couple, avec un ou des enfants à charge",
                  {"statut_marital": StatutMarital.concubinage.value,
                   "a_des_enfants_a_charge": True},
                  ("couple avec", "famille", "avec enfants", "nos enfants")),
        ),
    ),
    # --- Relances (une seule sera posée, voir `_relance_applicable`) ------------
    "type_location": Question(
        texte="Quel type de logement louez-vous ?",
        explication=(
            "La pièce demandée n'est pas la même : un bail classique pour un logement "
            "ordinaire, une attestation de résidence pour un logement CROUS ou un foyer, "
            "le contrat et l'accord du bailleur pour une sous-location."
        ),
        choix=(
            Choix("Un logement ordinaire (vide ou meublé)",
                  {"type_location": TypeLocation.meublee.value},
                  ("ordinaire", "classique", "meuble", "vide", "appartement", "studio", "colocation")),
            Choix("Une résidence étudiante, un foyer (CROUS...)",
                  {"type_location": TypeLocation.residence_etudiante.value},
                  ("crous", "residence", "foyer", "cite universitaire", "ehpad")),
            Choix("Une sous-location", {"type_location": TypeLocation.sous_location.value},
                  ("sous location", "sous loue", "souslocation")),
        ),
    ),
    "est_boursier": Question(
        texte="Êtes-vous boursier ou boursière ?",
        explication=(
            "Il s'agit de la bourse sur critères sociaux versée par le CROUS. Si vous en "
            "percevez une, sa notification d'attribution fait partie des pièces à fournir."
        ),
        choix=(
            Choix("Oui, je suis boursier(ère)", {"est_boursier": True},
                  ("oui", "boursier", "boursiere", "bourse", "crous")),
            Choix("Non", {"est_boursier": False}, ("non", "pas de bourse", "aucune")),
        ),
    ),
    "percoit_are": Question(
        texte="Percevez-vous l'allocation chômage (ARE) ?",
        explication=(
            "L'ARE est l'allocation versée par France Travail aux demandeurs d'emploi "
            "indemnisés. Si vous la percevez, son justificatif s'ajoute à votre dossier."
        ),
        choix=(
            Choix("Oui, je perçois l'ARE", {"percoit_are": True},
                  ("oui", "are", "allocation", "indemnise", "chomage")),
            Choix("Non", {"percoit_are": False}, ("non", "pas indemnise", "aucune")),
        ),
    ),
    "statut_professionnel_conjoint": Question(
        texte="Quelle est la situation professionnelle de votre conjoint(e) ?",
        explication=(
            "Les ressources du foyer sont examinées dans leur ensemble : les revenus de "
            "votre conjoint entrent dans le calcul, un justificatif est donc demandé."
        ),
        choix=(
            Choix("Salarié(e)", {"statut_professionnel_conjoint": StatutProfessionnel.salarie.value},
                  ("salarie", "salariee", "cdi", "cdd", "travaille")),
            Choix("Étudiant(e)", {"statut_professionnel_conjoint": StatutProfessionnel.etudiant.value},
                  ("etudiant", "etudiante", "etudie")),
            Choix("Demandeur d'emploi",
                  {"statut_professionnel_conjoint": StatutProfessionnel.demandeur_emploi.value},
                  ("demandeur", "chomage", "chomeur", "sans emploi")),
            Choix("Indépendant(e)",
                  {"statut_professionnel_conjoint": StatutProfessionnel.independant.value},
                  ("independant", "independante", "auto entrepreneur", "freelance")),
        ),
    ),
}

#: Les trois questions posées à tout le monde, dans cet ordre : du plus au moins
#: déterminant pour la liste des pièces.
CHAMPS_BASE = ("logement", "activite", "foyer")

#: La quatrième et dernière question, choisie d'après les réponses déjà données.
#: Une seule est retenue - la première applicable. C'est ce qui BORNE l'entretien
#: à quatre questions, sans compteur ni consigne au modèle.
_RELANCES = (
    ("type_location", lambda r: _a_repondu(r, "logement", "situation_logement",
                                           StatutLogement.locataire.value)),
    ("est_boursier", lambda r: _a_repondu(r, "activite", "statut_professionnel",
                                          StatutProfessionnel.etudiant.value)),
    ("percoit_are", lambda r: _a_repondu(r, "activite", "statut_professionnel",
                                         StatutProfessionnel.demandeur_emploi.value)),
    ("statut_professionnel_conjoint", lambda r: _est_en_couple(r)),
)


def _normaliser(texte: str) -> str:
    """Minuscules, sans accents, ponctuation réduite à des espaces.

    Sert à comparer ce que le citoyen a écrit — ou dicté — aux libellés : la
    transcription vocale ne rend jamais la ponctuation ni la casse du bouton."""
    plat = unicodedata.normalize("NFD", (texte or "").lower())
    plat = "".join(c for c in plat if unicodedata.category(c) != "Mn")
    return " ".join(re.findall(r"[a-z0-9]+", plat))


def reconnaitre(champ: str, message: str) -> Optional[Choix]:
    """Le choix correspondant au message, ou None s'il ne correspond à rien.

    Le clic sur un bouton renvoie le libellé exact ; la frappe et la dictée non.
    On accepte donc aussi les mots-clés, mais rien de plus : une réponse non
    reconnue fait REPOSER la question plutôt que deviner (même règle que
    `estimation_node`). Deviner ici fausserait la liste de pièces."""
    normalise = _normaliser(message)
    if not normalise:
        return None

    question = QUESTIONS[champ]
    for choix in question.choix:
        if normalise == _normaliser(choix.libelle):
            return choix
    for choix in question.choix:
        if any(_normaliser(mot) in normalise for mot in choix.mots_cles):
            return choix
    return None


def _a_repondu(reponses: dict, champ: str, cle_profil: str, valeur: str) -> bool:
    fragment = reponses.get(champ)
    return isinstance(fragment, dict) and fragment.get(cle_profil) == valeur


def _est_en_couple(reponses: dict) -> bool:
    fragment = reponses.get("foyer")
    if not isinstance(fragment, dict):
        return False
    return fragment.get("statut_marital") != StatutMarital.celibataire.value


def _relance_applicable(reponses: dict) -> Optional[str]:
    for champ, applicable in _RELANCES:
        if applicable(reponses):
            return champ
    return None


def prochain_champ(reponses: dict) -> Optional[str]:
    """Le champ à demander maintenant, ou None si l'entretien est terminé.

    Une question passée reste dans `reponses` (avec None pour valeur) : elle
    compte comme posée et n'est jamais reposée."""
    for champ in CHAMPS_BASE:
        if champ not in reponses:
            return champ
    relance = _relance_applicable(reponses)
    if relance is not None and relance not in reponses:
        return relance
    return None


def options(champ: str) -> list[str]:
    """Libellés à afficher. Les deux options standard sont ajoutées par l'appelant."""
    return [choix.libelle for choix in QUESTIONS[champ].choix]


def enregistrer(reponses: dict, champ: str, choix: Optional[Choix]) -> dict:
    """Ajoute une réponse (ou une question passée, `choix=None`) sans muter l'entrée."""
    return {**reponses, champ: (choix.profil if choix else None)}


def profil_declare(reponses: dict) -> dict:
    """Le profil DÉCLARÉ, assemblé à partir des seules réponses données.

    Rien d'inventé : une question passée n'écrit aucun champ, et l'absence d'un
    champ vaut « inconnu » pour les règles de checklist (socle commun)."""
    profil: dict = {}
    for fragment in reponses.values():
        if isinstance(fragment, dict):
            profil.update(fragment)
    return profil


# --- État entre deux tours ---------------------------------------------------
# Même canal que `estimation_node` : les réponses déjà données voyagent dans
# `pending_clarification.original_question`, que le client renvoie tel quel sans
# jamais l'afficher. C'est ce qui évite d'ouvrir une session côté serveur pour
# quatre questions à choix fixes.
_CLE_ETAT = "documents_reponses"


def encoder_etat(reponses: dict) -> str:
    return json.dumps({_CLE_ETAT: reponses}, ensure_ascii=False)


def decoder_etat(pending: Optional[dict]) -> dict:
    if not pending:
        return {}
    try:
        contenu = json.loads(pending.get("original_question") or "")
        reponses = contenu.get(_CLE_ETAT)
    except (json.JSONDecodeError, TypeError, AttributeError):
        return {}
    if not isinstance(reponses, dict):
        return {}
    # On ne garde que des champs connus : l'état vient du client, une clé
    # inventée ne doit pas pouvoir faire poser une question qui n'existe pas.
    return {champ: valeur for champ, valeur in reponses.items() if champ in QUESTIONS}
