"""Orchestrateur LangGraph de l'assistant citoyen (moteur APL RAG migré).

Version portée depuis le repo `apl_rag`. Trois adaptations MonParcours, toutes
signalées par un commentaire `MonParcours` dans le code :

1. Imports relatifs (le moteur est un sous-paquet, plus un script à la racine).
2. Champs de state additifs `answer` / `sources` : la couche API a besoin de la
   réponse sans le suffixe "Sources: ..." et de citations structurées
   {title, category}. Le chat CLI, lui, continue d'utiliser `response`.
3. `documents_necessaires` ne renvoie plus un `[MOCK]` : le profiling collecte un
   profil DÉCLARATIF (jamais authentifié, cf. `checklist_answer`) que la couche
   service transforme en vraie checklist MonParcours.
"""

import json
import re
from datetime import date
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END
from .llm_client import (
    EXPLAIN_OPTION,
    SKIP_OPTION,
    LlmContractError,
    _enforce_standard_options,
    call_llm,
    historique_de_confiance,
    with_standard_options,
)
from app.core.logger import logger
from . import rag_pipeline
from . import legal_pipeline
from . import etat_dialogue
from . import profilage_documents
# Politesse : fonction de texte pure, isolée dans son module - elle n'a besoin ni d'un
# LLM ni d'un index, et se teste donc sans rien charger de tout ça (voir `politesse`).
from .politesse import courtoisie, is_greeting  # noqa: F401 — `is_greeting` reste public
from .unanswered_log import (
    RAISON_AUCUN_ARTICLE,
    RAISON_EXTRAITS_INSUFFISANTS,
    RAISON_HORS_SUJET,
    RAISON_REFERENCE_INCONNUE,
    RAISON_REPONSE_ILLISIBLE,
    RAISON_TROP_DE_CLARIFICATIONS,
    REDIRECTION_OFFICIELLE,
    log_unanswered,
)
# Import direct de l'extracteur de references (pas de KgLocal) : c'est une regex, elle ne
# charge pas le graphe. Le graphe lui-meme n'est ouvert qu'a la premiere question juridique.
from .kg_apl.query import extract_references

from app.modules.citizen import estimation

# Pas d'authentification (canal WhatsApp notamment) : le chat est un espace ouvert, aucun
# profil connu à l'avance. "Mon dossier" et "le dossier d'un tiers" (ex: mon fils étudiant)
# demandent donc exactement le même traitement - questions de profiling puis documents
# nécessaires - d'où une seule intention `documents_necessaires` au lieu de deux.
# `estimation` suit le même principe : l'assistant est aveugle à l'authentification (voir
# `chatbot/service.py`), donc même un citoyen connecté obtient ici une fourchette par
# tranches, jamais son profil réel — l'estimation à partir de données exactes reste sur
# la page "Envoyer un dossier" (`GET /citizen/estimation`), pas dans la conversation.
VALID_INTENTS = {"documents_necessaires", "rag_general", "estimation",
                 "fondement_juridique", "fallback"}

CLASSIFIER_SYSTEM_PROMPT = """Tu es un classifieur d'intention pour l'assistant citoyen de MonParcours,
qui aide sur plusieurs démarches administratives (aide au logement APL, mais aussi d'autres démarches
comme le CROUS - bourse, logement étudiant).
Classe le message du citoyen dans EXACTEMENT une de ces 5 catégories :

- documents_necessaires: le citoyen demande quels documents sont nécessaires pour une demande d'APL
  spécifiquement (pour lui-même OU pour une autre personne, ex: son fils étudiant - le chat n'a pas
  d'authentification, donc les deux cas sont traités pareil). Réservé à l'APL : une question sur les
  documents pour une autre démarche (ex: CROUS) est classée `rag_general`.
  Exemples: "quels documents pour mon dossier ?", "quels documents pour mon fils étudiant ?",
  "je suis propriétaire, il me faudrait quoi ?"

- estimation: le citoyen veut savoir combien il pourrait toucher au titre de l'APL, un montant d'aide.
  Réservé à l'APL également (pas de calcul de montant pour les autres démarches).
  Exemples: "combien je pourrais toucher ?", "à combien s'élève l'APL pour mon loyer ?",
  "estime mon aide au logement", "quel montant d'APL pour un couple avec un enfant ?"

- rag_general: question générale sur une démarche administrative couverte par le corpus (réglementation,
  règles, fonctionnement, étapes, suivi) - que ce soit l'APL ou une autre démarche comme le CROUS.
  Exemples: "comment est calculée l'APL ?", "quel est le délai de traitement ?",
  "comment faire une demande de bourse CROUS ?", "où en est mon dossier CROUS ?"

- fondement_juridique: le citoyen demande CE QUE DIT LA LOI, ou conteste/veut comprendre une
  décision reçue. En clair : les questions où se tromper lui coûte cher, et où la réponse doit être
  le texte officiel daté plutôt qu'une explication générale — droit à l'aide selon sa situation,
  refus, trop-perçu, recours, délai de prescription, obligations du logement ou du bailleur.
  Exemples: "j'ai reçu un refus, est-ce que c'est légal ?", "la CAF me réclame un trop-perçu, a-t-elle
  le droit ?", "je loue l'appartement de mes parents, ai-je droit à l'APL ?", "comment contester ?",
  "mon logement est insalubre, ai-je quand même droit à l'aide ?"

- fallback: tout le reste (hors-sujet, ambigu, démarche non couverte par le corpus).

En cas d'hésitation entre rag_general et fondement_juridique : si le citoyen parle d'un droit, d'un
refus, d'une somme réclamée ou d'une contestation, choisis fondement_juridique. Une question qui
demande un MONTANT reste `estimation`.

Réponds UNIQUEMENT avec un JSON de la forme: {"intent": "documents_necessaires"}
"""

def cite_un_article(message: str) -> bool:
    """Le message contient-il une référence d'article (« L. 822-2 », « R822-5 ») ?

    Détection déterministe, comme la politesse : quand le citoyen recopie une référence de
    son courrier, aucun doute n'est possible sur la branche à prendre - inutile de payer un
    appel au classifieur, et impossible qu'il se trompe."""
    return bool(extract_references(message))


MOIS_FR = {
    "janvier": 1, "fevrier": 2, "février": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "aout": 8, "août": 8, "septembre": 9, "octobre": 10, "novembre": 11,
    "decembre": 12, "décembre": 12,
}


def parse_date_fr(texte: str):
    """Lit une date écrite par un citoyen, ou rend None si elle n'est pas lisible.

    Déterministe et volontairement stricte : cette date décide de la VERSION du texte de loi
    servie. Deviner « 2022 » comme le 1er janvier 2022 servirait le droit d'avant une
    éventuelle modification de mars - on préfère redemander le mois. Une date future ou
    antérieure à 1990 n'est pas une décision reçue : on ne la retient pas."""
    if not texte:
        return None
    t = texte.strip().lower()

    candidats = []
    m = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", t)
    if m:
        candidats.append((int(m.group(1)), int(m.group(2)), int(m.group(3))))
    m = re.search(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b", t)
    if m:
        candidats.append((int(m.group(3)), int(m.group(2)), int(m.group(1))))
    m = re.search(r"\b(\d{1,2})(?:er)?\s+([a-zàâäéèêëïîôöùûüç]+)\s+(\d{4})\b", t)
    if m and m.group(2) in MOIS_FR:
        candidats.append((int(m.group(3)), MOIS_FR[m.group(2)], int(m.group(1))))
    m = re.search(r"\b([a-zàâäéèêëïîôöùûüç]+)\s+(\d{4})\b", t)
    if m and m.group(1) in MOIS_FR:
        candidats.append((int(m.group(2)), MOIS_FR[m.group(1)], 1))

    for annee, mois, jour in candidats:
        try:
            valeur = date(annee, mois, jour)
        except ValueError:
            continue
        if date(1990, 1, 1) <= valeur <= date.today():
            return valeur
    return None


class D4State(TypedDict):
    message: str                        # question posée par le citoyen
    conversation_history: list[dict]     # tours précédents [{"role": "user"|"assistant", "content": ...}]
    citizen_profile: Optional[dict]      # profil du citoyen si connu (injecté par le flux principal)
    intent: Optional[str]                # rempli par l'orchestrateur
    response: Optional[str]              # réponse finale (texte affiché au citoyen)
    response_options: Optional[list]     # options de clarification (popup), ou None si réponse finale
    pending_clarification: Optional[dict]  # {"original_question": str, "intent": str} si le tour
                                            # précédent attend une réponse de clarification, sinon None
                                            # ("intent" indique vers quel nœud renvoyer la réponse)
    is_clarification_reply: bool         # True si CE message est une réponse structurée au popup de
                                          # clarification (injecté par l'appelant/UI, pas déduit du texte)
    user_role: Optional[str]             # "citizen" (défaut) ou "agent" - injecté par l'appelant/UI,
                                          # jamais déduit du contenu du message. Détermine les catégories
                                          # de chunks accessibles, voir CATEGORIES_BY_ROLE.
    # MonParcours (additif, le chat CLI n'en dépend pas) : réponse "propre" sans le
    # suffixe "Sources: ...", citations structurées {title, category}, et profil
    # déclaratif collecté par le profiling `documents_necessaires`.
    answer: Optional[str]
    sources: Optional[list]
    collected_profile: Optional[dict]
    # Branche juridique : la date du droit à appliquer (celle de la décision contestée) et
    # le fait que la question ait déjà été posée. Comme l'historique, les deux font
    # l'aller-retour par le client - aucune session serveur.
    date_reference: Optional[str]
    date_asked: bool


# Catégories de chunks accessibles selon le rôle. "legislation" (Legifrance) est réservé aux agents -
# contenu trop complexe/juridique pour le prompt citoyen (vulgarisé, voir décision 8 du CLAUDE.md).
# Pas encore de chunks "legislation" dans le corpus (corpus enrichi progressivement) : le filtre est
# déjà en place, prêt à s'appliquer dès qu'ils seront ajoutés.
CATEGORIES_BY_ROLE = {
    "citizen": ["demarche"],
    "agent": ["demarche", "legislation"],
}


def route_intent_llm(state: D4State) -> str:
    """Classifieur LLM robuste : en cas d'échec API, JSON malformé, ou intent
    inconnu, on retombe systématiquement sur 'fallback' (jamais de crash,
    jamais de comportement indéfini)."""
    try:
        messages = [{"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT}]
        messages.extend(historique_de_confiance(state["conversation_history"]))
        messages.append({"role": "user", "content": state["message"]})

        result = call_llm(
            messages=messages,
            json_mode=True,
            temperature=0.0,
        )
        parsed = json.loads(result)
        intent = parsed.get("intent", "").strip()
        if intent in VALID_INTENTS:
            return intent
        return "fallback"
    except Exception:  # noqa: BLE001 — le classifieur ne doit jamais planter un tour
        # Repli silencieux pour le citoyen, jamais pour l'équipe : un classifieur qui
        # échoue envoie TOUTES les questions en hors-sujet, ce qui ressemble de loin à
        # « le corpus ne couvre pas grand-chose ».
        logger.exception("chatbot: classification impossible, repli sur fallback")
        return "fallback"


# --- Noeuds ---
def orchestrator_node(state: D4State) -> D4State:
    pending = state.get("pending_clarification")
    # Reponse structuree au popup de clarification -> on ne reclassifie pas, on renvoie
    # directement au noeud qui avait pose la question (rag_general OU documents_necessaires).
    if state.get("is_clarification_reply") and pending:
        return {**state, "intent": pending["intent"]}
    # Politesse ("Bonjour", "merci", "bonne journee") -> pas la peine d'appeler le
    # classifieur LLM, tres frequent en ouverture comme en cloture, et jamais ambigu.
    if courtoisie(state["message"]):
        return {**state, "intent": "fallback"}
    # Le citoyen recopie une reference d'article de son courrier -> la branche juridique est
    # certaine, meme motif deterministe que la politesse (voir cite_un_article).
    if cite_un_article(state["message"]):
        return {**state, "intent": "fondement_juridique"}
    intent = route_intent_llm(state)
    return {**state, "intent": intent}


#: Phrase d'introduction de la checklist. Écrite ici plutôt que demandée au modèle :
#: c'est une phrase de liaison, pas une réponse - la faire générer coûterait un appel
#: pour un résultat qui ne varie pas.
INTRO_CHECKLIST = "Merci. D'après ce que vous m'avez indiqué, voici ce qu'il vous faut."


def _demander_champ(state: D4State, champ: str, reponses: dict, *, prefixe: str = "") -> D4State:
    question = profilage_documents.QUESTIONS[champ]
    texte = f"{prefixe}{question.texte}" if prefixe else question.texte
    return {
        **state,
        "response": texte,
        "answer": texte,
        "sources": [],
        "response_options": _enforce_standard_options(profilage_documents.options(champ)),
        "pending_clarification": {
            "original_question": profilage_documents.encoder_etat(reponses),
            "intent": "documents_necessaires",
        },
        "collected_profile": None,
    }


def documents_necessaires_node(state: D4State) -> D4State:
    """Entretien de profilage MENÉ PAR LE CODE, sur le modèle d'`estimation_node`.

    Le modèle a reconnu l'intention ; il ne conduit pas l'échange. Les questions, leur
    ordre et le moment de s'arrêter viennent de `profilage_documents`, où la liste des
    champs est finie - le plafond de quatre questions est donc une propriété du parcours
    et non une consigne que le modèle pourrait perdre de vue (il la perdait : voir le
    module pour le détail de la fenêtre d'historique tronquée).

    Aucun appel LLM ici. Une panne du modèle ne peut donc plus interrompre un entretien
    en cours, et deux entretiens identiques donnent exactement la même chose."""
    pending = state.get("pending_clarification")
    en_cours = bool(pending) and pending.get("intent") == "documents_necessaires"
    is_reply = bool(state.get("is_clarification_reply")) and en_cours
    reponses = profilage_documents.decoder_etat(pending) if en_cours else {}
    message = state["message"]

    if is_reply:
        champ = profilage_documents.prochain_champ(reponses)
        if champ is not None:
            if message == EXPLAIN_OPTION:
                explication = f"{profilage_documents.QUESTIONS[champ].explication}\n\n"
                return _demander_champ(state, champ, reponses, prefixe=explication)
            if message == SKIP_OPTION:
                # Passée = posée : on enchaîne sur la suivante au lieu d'insister, et
                # cette question-là ne reviendra pas.
                reponses = profilage_documents.enregistrer(reponses, champ, None)
            else:
                choix = profilage_documents.reconnaitre(champ, message)
                if choix is not None:
                    reponses = profilage_documents.enregistrer(reponses, champ, choix)
                # Réponse non reconnue : on repose la même question. Deviner ici
                # fausserait la liste des pièces, ce qui coûte au citoyen un dossier
                # incomplet - le prix d'une question reposée est sans commune mesure.

    champ_manquant = profilage_documents.prochain_champ(reponses)
    if champ_manquant is not None:
        return _demander_champ(state, champ_manquant, reponses)

    # Entretien terminé : le profil déclaré part vers la couche service, qui produit la
    # vraie checklist MonParcours. `collected_profile` non-None est ce qui l'y autorise.
    return {
        **state,
        "response": INTRO_CHECKLIST,
        "answer": INTRO_CHECKLIST,
        "sources": [],
        "response_options": None,
        "pending_clarification": None,
        "collected_profile": profilage_documents.profil_declare(reponses),
    }


ABANDON_ESTIMATION = (
    "Pas de souci : sans cette information je ne peux pas calculer une fourchette "
    "fiable. Vous pouvez recommencer une estimation quand vous le souhaitez, ou "
    "vous connecter et compléter votre dossier pour une estimation à partir de "
    "vos données exactes."
)

# Ordre fixe des 4 questions par tranches. Une seule à la fois (même contrainte
# que `documents_necessaires`), jamais en parallèle.
_ESTIMATION_FIELD_ORDER = ["revenu", "loyer", "zone", "composition"]

_ESTIMATION_QUESTIONS = {
    "revenu": "Pour une estimation indicative, dans quelle tranche se situent les revenus nets mensuels du foyer ?",
    "loyer": "Quel est le loyer mensuel hors charges, environ ?",
    "zone": "Dans quelle zone se situe le logement ?",
    "composition": "Quelle est la composition du foyer ?",
}

_ESTIMATION_OPTIONS = {
    "revenu": [estimation.LABEL_TRANCHE_REVENU[t] for t in estimation.TrancheRevenu],
    "loyer": [estimation.LABEL_TRANCHE_LOYER[t] for t in estimation.TrancheLoyer],
    "zone": [estimation.LABEL_ZONE[z] for z in estimation.Zone],
    "composition": [estimation.LABEL_COMPOSITION[c] for c in estimation.CompositionFoyer],
}

_ESTIMATION_EXPLANATIONS = {
    "revenu": (
        "Il s'agit des revenus nets de l'ensemble du foyer (après cotisations "
        "sociales, avant impôt sur le revenu) : cumulez les salaires, allocations "
        "et autres ressources mensuelles du foyer."
    ),
    "loyer": "Le montant du loyer seul, hors charges locatives (eau, entretien des parties communes...).",
    "zone": (
        "Paris et sa proche banlieue sont en zone 1, les grandes agglomérations en "
        "zone 2, le reste du territoire en zone 3 — choisissez celle qui se "
        "rapproche le plus de votre commune."
    ),
    "composition": "Choisissez la situation la plus proche : seul(e) ou en couple, et le nombre d'enfants à charge.",
}

# Reverse lookups (libellé affiché -> valeur d'enum), pour interpréter le choix
# renvoyé par l'UI (les boutons envoient le libellé tel quel, voir `selectOption`).
_REVENU_PAR_LABEL = {v: k for k, v in estimation.LABEL_TRANCHE_REVENU.items()}
_LOYER_PAR_LABEL = {v: k for k, v in estimation.LABEL_TRANCHE_LOYER.items()}
_ZONE_PAR_LABEL = {v: k for k, v in estimation.LABEL_ZONE.items()}
_COMPOSITION_PAR_LABEL = {v: k for k, v in estimation.LABEL_COMPOSITION.items()}


def _encode_estimation_state(reponses: dict) -> str:
    """Sérialise les réponses déjà collectées dans `pending_clarification.original_question`.

    Ce champ n'est affiché nulle part côté client (voir `useChatbot.ts` : il vit
    dans une ref, renvoyé tel quel au tour suivant) - c'est un canal de
    bookkeeping interne entre deux appels de ce nœud, pas une donnée montrée au
    citoyen. Le contourner ainsi évite d'introduire une session côté backend
    juste pour 4 questions à choix fixes. Mécanique commune : `etat_dialogue`."""
    return etat_dialogue.encoder("estimation_reponses", reponses)


def _decode_estimation_state(pending: Optional[dict]) -> dict:
    reponses = etat_dialogue.decoder(pending, "estimation_reponses")
    return reponses if isinstance(reponses, dict) else {}


def _ask_estimation_field(state: D4State, champ: str, reponses: dict, *, prefix: str = "") -> D4State:
    texte = f"{prefix}{_ESTIMATION_QUESTIONS[champ]}" if prefix else _ESTIMATION_QUESTIONS[champ]
    return {
        **state,
        "response": texte,
        "answer": texte,
        "sources": [],
        "response_options": _enforce_standard_options(_ESTIMATION_OPTIONS[champ]),
        "pending_clarification": {
            "original_question": _encode_estimation_state(reponses),
            "intent": "estimation",
        },
    }


def estimation_node(state: D4State) -> D4State:
    """Estimation indicative par tranches - zéro LLM pour le calcul (voir
    `citizen/estimation.py`) : le LLM classifieur ne fait que reconnaître
    l'intention, les 4 questions et le calcul qui suit sont un pur enchaînement
    déterministe, réutilisant le mécanisme de clarification existant
    (`response_options` / `pending_clarification`) sans rien y ajouter côté
    contrat API ou frontend."""
    pending = state.get("pending_clarification")
    is_reply = bool(state.get("is_clarification_reply")) and pending is not None and pending.get("intent") == "estimation"
    reponses = _decode_estimation_state(pending) if pending else {}
    message = state["message"]

    if is_reply:
        champ_en_cours = next((f for f in _ESTIMATION_FIELD_ORDER if f not in reponses), None)
        if champ_en_cours is not None:
            if message == EXPLAIN_OPTION:
                explication = f"{_ESTIMATION_EXPLANATIONS[champ_en_cours]}\n\n"
                return _ask_estimation_field(state, champ_en_cours, reponses, prefix=explication)
            if message == SKIP_OPTION:
                return {
                    **state,
                    "response": ABANDON_ESTIMATION,
                    "answer": ABANDON_ESTIMATION,
                    "sources": [],
                    "response_options": None,
                    "pending_clarification": None,
                }
            if message in _ESTIMATION_OPTIONS[champ_en_cours]:
                reponses = {**reponses, champ_en_cours: message}
            # Réponse non reconnue (texte libre inattendu) : on repose la même
            # question plutôt que de deviner - `reponses` reste inchangé.

    champ_manquant = next((f for f in _ESTIMATION_FIELD_ORDER if f not in reponses), None)
    if champ_manquant is not None:
        return _ask_estimation_field(state, champ_manquant, reponses)

    # Les 4 tranches sont connues : calcul déterministe, jamais le LLM.
    try:
        resultat = estimation.estimer_aide_indicative(
            tranche_revenu=_REVENU_PAR_LABEL[reponses["revenu"]],
            tranche_loyer=_LOYER_PAR_LABEL[reponses["loyer"]],
            zone=_ZONE_PAR_LABEL[reponses["zone"]],
            composition=_COMPOSITION_PAR_LABEL[reponses["composition"]],
        )
        texte = (
            f"D'après ces informations, l'aide au logement estimée se situe entre "
            f"{resultat.montant_min} € et {resultat.montant_max} € par mois "
            f"(estimation centrale : {resultat.montant_median} €).\n\n{resultat.avertissement}"
        )
    except Exception:  # noqa: BLE001 — l'estimation ne doit jamais planter la conversation
        # Le calcul est déterministe : s'il échoue, c'est un défaut du code ou du barème,
        # pas une réponse du modèle. Sans trace, il est indétectable - le citoyen reçoit
        # une excuse polie et l'incident disparaît.
        logger.exception(
            "chatbot: calcul d'estimation impossible",
            {"champs": sorted(reponses)},
        )
        texte = (
            "Je n'ai pas pu calculer d'estimation à partir de ces informations. "
            "Vous pouvez réessayer."
        )

    return {
        **state,
        "response": texte,
        "answer": texte,
        "sources": [],
        "response_options": None,
        "pending_clarification": None,
    }


_rag_pipeline_instance = None


def get_rag_pipeline():
    """Lazy singleton : le pipeline (index BM25+Qdrant, modèle d'embeddings)
    n'est construit qu'à la première question qui en a réellement besoin."""
    global _rag_pipeline_instance
    if _rag_pipeline_instance is None:
        _rag_pipeline_instance = rag_pipeline.RagPipeline()
    return _rag_pipeline_instance


def mode_recherche() -> str:
    """« hybride », « bm25_seul », ou « non_initialise » — SANS construire le pipeline.

    Le repli en BM25 seul est silencieux par conception (l'assistant doit répondre même
    sans couche sémantique), et c'est précisément ce qui le rend dangereux : une fois
    la ligne de démarrage passée, plus rien ne dit qu'on tourne en mode dégradé. En le
    remontant à chaque tour, une dégradation durable devient visible dans les métriques
    au lieu de se deviner à la qualité des réponses.

    Ne force JAMAIS la construction : appelé sur un tour de politesse, cela déclencherait
    le chargement complet des index pour écrire une ligne de log."""
    if _rag_pipeline_instance is None:
        return "non_initialise"
    return "hybride" if _rag_pipeline_instance.semantic_available else "bm25_seul"


SHOW_SOURCES = True  # bascule simple : afficher ou non les sources au citoyen

#: Plafond de questions de clarification sur UNE question du citoyen. Tenu par le code :
#: le prompt demandait au modèle de compter les siennes en relisant l'historique, que le
#: client tronque aux 6 derniers messages - il ne voyait donc jamais son propre plafond.
RAG_CLARIFICATIONS_MAX = 4

#: Ajoutée au prompt au dernier tour. Le modèle est prévenu qu'il doit conclure ; s'il
#: pose quand même une question, le code tranche à sa place (voir plus bas).
CONSIGNE_REPONSE_OBLIGATOIRE = (
    "Tu as déjà posé le nombre maximum de questions de clarification pour cette question. "
    "Tu DOIS répondre maintenant à partir des extraits disponibles, en signalant "
    "clairement ce que tu ne peux pas trancher faute d'information. Ne pose plus de question."
)

_CLE_RAG = "rag_clarification"
#: Borne de sûreté sur l'état renvoyé par le client : au-delà, c'est du bruit ou une
#: main malveillante, et ni l'un ni l'autre ne doit gonfler le prompt.
_MAX_REPONSES_GARDEES = 10


#: L'état voyage dans `pending_clarification.original_question`, que le schéma borne
#: (voir `schemas`). Ces deux tailles sont ce qui garantit qu'on reste sous cette borne :
#: une question de 2000 caractères suivie de dix réponses de 2000 la ferait exploser, et
#: le dialogue deviendrait irrecevable au tour suivant. Elles sont larges pour ce dont
#: elles ont l'usage - retrouver les bons extraits ne demande pas la question intégrale,
#: et une réponse de clarification est un choix ou une valeur courte.
_QUESTION_GARDEE_MAX = 500
_REPONSE_GARDEE_MAX = 200


def _encoder_etat_rag(question: str, reponses: list[str], posees: int) -> str:
    return etat_dialogue.encoder(
        _CLE_RAG,
        {
            "question": question[:_QUESTION_GARDEE_MAX],
            "reponses": [r[:_REPONSE_GARDEE_MAX] for r in reponses[-_MAX_REPONSES_GARDEES:]],
            "posees": posees,
        },
    )


def _decoder_etat_rag(pending: Optional[dict]) -> Optional[dict]:
    """L'état d'un dialogue de clarification en cours, ou None s'il n'y en a pas.

    Revalide tout : l'état vient du client. Un compteur bidonné ne donnerait de toute
    façon qu'une conversation plus longue à celui qui le bidonne."""
    brut = etat_dialogue.decoder(pending, _CLE_RAG)
    if not isinstance(brut, dict):
        return None
    question = brut.get("question")
    reponses = brut.get("reponses")
    posees = brut.get("posees")
    if not isinstance(question, str) or not question:
        return None
    return {
        "question": question,
        "reponses": [r for r in reponses if isinstance(r, str)][-_MAX_REPONSES_GARDEES:]
        if isinstance(reponses, list) else [],
        "posees": posees if isinstance(posees, int) and posees >= 0 else 0,
    }


def rag_general_node(state: D4State) -> D4State:
    """Question générale : retrieval hybride puis génération sourcée.

    Les réponses aux clarifications sont ACCUMULÉES. Auparavant la requête valait
    « question d'origine + dernier message » : la réponse à la clarification précédente
    était perdue à chaque tour, donc deux « Oui » de suite produisaient exactement la même
    requête, les mêmes extraits, et la même question reposée à l'identique. Le citoyen ne
    s'en sortait qu'en tapant une phrase plus longue. Elles sont donc toutes conservées, et
    leur nombre est plafonné ici plutôt que confié au modèle."""
    pending = state.get("pending_clarification")
    en_cours = bool(pending) and pending.get("intent") == "rag_general"
    etat = _decoder_etat_rag(pending) if en_cours else None
    is_reply = bool(state.get("is_clarification_reply")) and etat is not None

    if is_reply:
        question = etat["question"]
        reponses = [*etat["reponses"], state["message"]]
        posees = etat["posees"]
    else:
        question, reponses, posees = state["message"], [], 0

    # « Je ne comprends pas » et « Passer » sont des actions, pas des informations : le
    # modèle doit les voir (il explique, puis repose), mais les mêler à la requête de
    # recherche polluerait le retrieval avec des mots qui ne disent rien du sujet.
    informatives = [r for r in reponses if r not in (EXPLAIN_OPTION, SKIP_OPTION)]
    requete_recherche = " ".join([question, *informatives])
    query = " ".join([question, *reponses])

    role = state.get("user_role") or "citizen"
    categories = CATEGORIES_BY_ROLE.get(role, CATEGORIES_BY_ROLE["citizen"])
    dernier_tour = posees >= RAG_CLARIFICATIONS_MAX
    try:
        result = get_rag_pipeline().answer(
            query,
            category=categories,
            conversation_history=state["conversation_history"],
            requete_recherche=requete_recherche,
            consigne_finale=CONSIGNE_REPONSE_OBLIGATOIRE if dernier_tour else None,
        )
    except LlmContractError:
        # Le pire cas de cette branche : afficher un texte illisible AVEC les sources
        # officielles retrouvées en dessous. La réponse paraîtrait fondée alors qu'elle
        # ne l'est pas. On renvoie donc au canal officiel, sans aucune source.
        log_unanswered(query, "rag_general", RAISON_REPONSE_ILLISIBLE, user_role=role)
        return {**state, "response": REDIRECTION_OFFICIELLE, "answer": REDIRECTION_OFFICIELLE,
                "sources": [], "response_options": None, "pending_clarification": None}

    if result["type"] == "clarification":
        if dernier_tour:
            # Le modèle a été prévenu et interroge quand même : c'est le code qui
            # tranche. Consigné, parce qu'une question qui tourne en rond dit quelque
            # chose du corpus autant que du modèle.
            log_unanswered(
                requete_recherche, "rag_general", RAISON_TROP_DE_CLARIFICATIONS,
                details={"questions_posees": posees}, user_role=role,
            )
            return {**state, "response": REDIRECTION_OFFICIELLE, "answer": REDIRECTION_OFFICIELLE,
                    "sources": [], "response_options": None, "pending_clarification": None}
        return {
            **state,
            "response": result["text"],
            "answer": result["text"],
            "sources": [],  # une clarification n'est pas une réponse sourcée
            "response_options": result["options"],
            "pending_clarification": {
                "original_question": _encoder_etat_rag(question, reponses, posees + 1),
                "intent": "rag_general",
            },
        }

    # Le corpus ne permettait pas de répondre : le LLM le signale (repondu=false), le code
    # substitue le renvoi officiel et consigne la question. On ne laisse pas passer une
    # demi-réponse - et surtout on garde la trace de ce qui manquait.
    #
    # Le champ est EXIGÉ, pas seulement lu : un `repondu` absent était auparavant traité
    # comme un oui, si bien qu'il suffisait au modèle d'oublier le champ pour que sa
    # réponse passe pour fondée. Sur des droits sociaux, l'oubli doit coûter un renvoi de
    # trop, pas une réponse de trop - et le journal dira si le modèle l'oublie souvent.
    if not result.get("repondu"):
        log_unanswered(
            query, "rag_general", RAISON_EXTRAITS_INSUFFISANTS,
            details={"resume_manque": result["text"][:300]}, user_role=role,
        )
        return {**state, "response": REDIRECTION_OFFICIELLE, "answer": REDIRECTION_OFFICIELLE,
                "sources": [], "response_options": None, "pending_clarification": None}

    response = result["text"]
    if SHOW_SOURCES:
        sources_str = ", ".join(result["sources"])
        response = f"{response}\n\nSources: {sources_str}"

    # MonParcours (additif) : citations structurées {title, category} dédupliquées par
    # source, dérivées des chunks retrouvés - consommées par la couche API, qui les
    # affiche à part plutôt qu'en suffixe de texte.
    structured = {}
    for chunk, _score in result["retrieved_chunks"]:
        url = chunk.get("source_url")
        if url and url not in structured:
            structured[url] = {
                "title": chunk.get("source_title") or url,
                "category": chunk.get("category", "demarche"),
                "url": url,
            }

    return {
        **state,
        "response": response,
        "answer": result["text"],
        "sources": list(structured.values()),
        "response_options": None,
        "pending_clarification": None,
    }


_legal_pipeline_instance = None


def get_legal_pipeline():
    """Le pipeline juridique partage les index du pipeline RAG (mêmes BM25 et Qdrant) :
    seuls le filtre de catégorie, la consultation du graphe et le prompt diffèrent."""
    global _legal_pipeline_instance
    if _legal_pipeline_instance is None:
        _legal_pipeline_instance = legal_pipeline.get_legal_pipeline(get_rag_pipeline())
    return _legal_pipeline_instance


# --- La question de date, posée par le CODE ---------------------------------------------
# C'est le point le plus important de cette branche. La loi change : un citoyen qui conteste
# une décision de 2022 doit recevoir le droit de 2022, pas celui d'aujourd'hui. Lui servir la
# règle actuelle avec une source officielle affichée à côté est pire qu'une réponse vague :
# c'est faux, et ça paraît fiable.
#
# On ne confie donc PAS cette question au LLM (qui peut l'oublier, ou croire la deviner du
# contexte) : elle est posée systématiquement, en dur, avant toute réponse juridique. Le
# mécanisme d'affichage reste celui des clarifications existantes - même contrat, mêmes
# options garanties (voir llm_client.with_standard_options).
DATE_QUESTION = (
    "Avant de vous répondre : votre question porte-t-elle sur une décision que vous avez "
    "déjà reçue (un courrier de la CAF) ?"
)
OPTION_DECISION_RECUE = "Oui, j'ai reçu une décision"
OPTION_QUESTION_GENERALE = "Non, c'est une question générale"

DATE_VALEUR_QUESTION = (
    "De quand date cette décision ? Indiquez la date qui figure sur le courrier "
    "(par exemple 12/03/2024, ou « mars 2024 » si vous ne vous souvenez que du mois)."
)
DATE_EXPLICATION = (
    "La loi sur les aides au logement change au fil des années. Si vous contestez une "
    "décision, ce qui compte n'est pas la règle d'aujourd'hui mais celle qui s'appliquait "
    "au moment de cette décision. C'est pour ça que je vous demande si vous avez déjà reçu "
    "un courrier : avec sa date, je peux vous donner le texte exact qui s'appliquait alors."
)
DATE_ILLISIBLE = (
    "Je n'ai pas réussi à lire cette date. Vous pouvez l'écrire par exemple 12/03/2024, "
    "ou simplement « mars 2024 »."
)
DATE_ABANDONNEE = (
    "Faute de date, je vous réponds sur le droit en vigueur aujourd'hui. Si votre décision "
    "est ancienne, les règles ont pu changer depuis : dans ce cas, rapprochez-vous de votre "
    "CAF avec le courrier sous les yeux.\n\n"
)


def _clarification_date(state, original_question, step, texte, options=None):
    """Une question de clarification produite par le code, au même format que celles du LLM."""
    return {
        **state,
        "response": texte,
        "answer": texte,
        "response_options": with_standard_options(options) if options else None,
        "pending_clarification": {
            "original_question": original_question,
            "intent": "fondement_juridique",
            "step": step,
        },
        "sources": [],
    }


def fondement_juridique_node(state: D4State) -> D4State:
    """Répond à partir du texte de loi daté, avec ses sources Légifrance.

    Deux différences assumées avec `rag_general` : les sources ne sont JAMAIS masquables ici
    (elles font partie de la réponse, pas de son habillage - voir `SHOW_SOURCES`), et le
    prompt interdit la reformulation approximative, parce que sur du texte juridique la
    précision perdue est justement ce qui coûte cher au citoyen."""
    pending = state.get("pending_clarification") or {}
    is_reply = bool(state.get("is_clarification_reply") and pending)
    step = pending.get("step") if is_reply else None
    original_question = pending.get("original_question") if is_reply else state["message"]
    message = (state["message"] or "").strip()

    date_reference = state.get("date_reference")
    date_asked = bool(state.get("date_asked"))
    avertissement = ""

    if step == "date_choix":
        if message == EXPLAIN_OPTION:
            # Le citoyen ne comprend pas POURQUOI on lui demande ça : on explique, puis on
            # repose la même question. L'explication est écrite ici parce que la question
            # l'est aussi - on ne délègue pas au LLM le soin d'expliquer une consigne du code.
            return _clarification_date(
                state, original_question, "date_choix",
                f"{DATE_EXPLICATION}\n\n{DATE_QUESTION}",
                [OPTION_DECISION_RECUE, OPTION_QUESTION_GENERALE],
            )
        if message == OPTION_DECISION_RECUE:
            return _clarification_date(state, original_question, "date_valeur", DATE_VALEUR_QUESTION)
        # "Non", "Passer cette question", ou n'importe quoi d'autre : droit d'aujourd'hui.
        date_asked, date_reference = True, None

    elif step in ("date_valeur", "date_valeur_2"):
        if message == EXPLAIN_OPTION:
            return _clarification_date(
                state, original_question, step, f"{DATE_EXPLICATION}\n\n{DATE_VALEUR_QUESTION}"
            )
        if message == SKIP_OPTION:
            date_asked, date_reference, avertissement = True, None, DATE_ABANDONNEE
        else:
            valeur = parse_date_fr(message)
            if valeur:
                date_asked, date_reference = True, valeur.isoformat()
            elif step == "date_valeur":
                # Une seule relance : insister davantage ferait décrocher un citoyen qui ne
                # retrouve pas son courrier.
                return _clarification_date(
                    state, original_question, "date_valeur_2",
                    f"{DATE_ILLISIBLE}\n\n{DATE_VALEUR_QUESTION}",
                )
            else:
                date_asked, date_reference, avertissement = True, None, DATE_ABANDONNEE

    elif not date_asked:
        # Première question juridique de la conversation : on demande avant de répondre.
        return _clarification_date(
            state, original_question, "date_choix", DATE_QUESTION,
            [OPTION_DECISION_RECUE, OPTION_QUESTION_GENERALE],
        )

    question = original_question or state["message"]
    result = get_legal_pipeline().answer(
        question,
        date_reference=date.fromisoformat(date_reference) if date_reference else None,
        conversation_history=state["conversation_history"],
    )

    # Ce que le graphe n'a pas su fournir est consigné : une référence absente comme une
    # question sans article, ce sont les deux façons dont le corpus juridique montre ses
    # trous (voir unanswered_log).
    role = state.get("user_role") or "citizen"
    if not result.get("answered", True):
        log_unanswered(question, "fondement_juridique", RAISON_AUCUN_ARTICLE, user_role=role)
    if result["references_inconnues"]:
        log_unanswered(
            question, "fondement_juridique", RAISON_REFERENCE_INCONNUE,
            details={"references": result["references_inconnues"]}, user_role=role,
        )

    sources = [
        {"title": s["titre"], "category": "legislation", "url": s["url"]}
        for s in result["sources"]
    ]
    return {
        **state,
        # `response` porte les sources en suffixe (chat texte) ; `answer` ne les porte pas,
        # l'UI web les affichant à part en liens cliquables. Sur cette branche, l'un ou
        # l'autre est obligatoire - jamais rien.
        "response": avertissement + result["text"] + result["sources_texte"],
        "answer": avertissement + result["text"],
        "sources": sources,
        "response_options": None,
        "pending_clarification": None,
        "date_reference": date_reference,
        "date_asked": date_asked,
    }


GREETING_RESPONSE = (
    "Bonjour ! Je peux vous aider sur plusieurs démarches administratives (aide au logement APL, "
    "CROUS...) : questions générales, ou documents et montant pour une demande d'APL. "
    "Que puis-je faire pour vous ?"
)
FALLBACK_RESPONSE = (
    "Je ne peux pas répondre à cette question. Je peux vous aider sur les documents et le montant "
    "d'une demande d'APL, ou des questions générales sur les démarches administratives que je connais "
    "(aide au logement, CROUS...)."
)


THANKS_RESPONSE = (
    "Je vous en prie ! Si une autre question sur vos démarches vous vient, je suis là."
)
FAREWELL_RESPONSE = (
    "Bonne journée ! N'hésitez pas à revenir si vous avez une question sur vos démarches."
)
COURTOISIE_RESPONSES = {
    "salutation": GREETING_RESPONSE,
    "remerciement": THANKS_RESPONSE,
    "au_revoir": FAREWELL_RESPONSE,
}


def fallback_node(state: D4State) -> D4State:
    """Trois situations très différentes arrivent ici, et une seule est un échec.

    Une politesse reçoit une politesse. Une vraie question à laquelle on n'a pas su
    répondre est CONSIGNÉE (voir `unanswered_log`) : c'est elle qui dit ce qui manque au
    corpus, et la perdre reviendrait à répéter la même impasse indéfiniment."""
    forme = courtoisie(state["message"])
    if forme:
        return {
            **state,
            "response": COURTOISIE_RESPONSES[forme],
            "answer": COURTOISIE_RESPONSES[forme],
            "sources": [],
            "response_options": None,
            "pending_clarification": None,
        }

    log_unanswered(
        state["message"], "fallback", RAISON_HORS_SUJET,
        user_role=state.get("user_role") or "citizen",
    )
    response = FALLBACK_RESPONSE
    return {
        **state,
        "response": response,
        "answer": response,
        "sources": [],
        "response_options": None,
        "pending_clarification": None,
    }


# --- Construction du graphe ---
def build_graph():
    graph = StateGraph(D4State)

    graph.add_node("orchestrator", orchestrator_node)
    graph.add_node("documents_necessaires", documents_necessaires_node)
    graph.add_node("estimation", estimation_node)
    graph.add_node("rag_general", rag_general_node)
    graph.add_node("fondement_juridique", fondement_juridique_node)
    graph.add_node("fallback", fallback_node)

    graph.set_entry_point("orchestrator")

    graph.add_conditional_edges(
        "orchestrator",
        lambda state: state["intent"],
        {
            "documents_necessaires": "documents_necessaires",
            "estimation": "estimation",
            "rag_general": "rag_general",
            "fondement_juridique": "fondement_juridique",
            "fallback": "fallback",
        },
    )

    for node_name in ["documents_necessaires", "estimation", "rag_general",
                      "fondement_juridique", "fallback"]:
        graph.add_edge(node_name, END)

    return graph.compile()


if __name__ == "__main__":
    # Chat CLI de développement (équivalent de celui du repo `apl_rag`) : simule le popup
    # de clarification en mode texte. Lancer depuis backend/ :
    #     python -m app.modules.chatbot.rag.orchestrator
    from ..checklist_answer import render_checklist

    app = build_graph()
    get_rag_pipeline()  # init eager : le chargement (BM25+Qdrant+embeddings) se paie ici,
                        # au demarrage, pas silencieusement pendant la 1ere question du citoyen

    print("Chat interactif (orchestrateur D4). Tapez exit() pour quitter.")
    print("(Simulation du popup de clarification en mode texte : si des options sont proposees,")
    print(" tape le numero de ton choix, ou autre chose pour changer de sujet.)")

    role_input = input("Role (citizen/agent, defaut citizen): ").strip().lower()
    user_role = role_input if role_input in CATEGORIES_BY_ROLE else "citizen"
    print(f"-> role={user_role} (categories accessibles: {CATEGORIES_BY_ROLE[user_role]})")

    conversation_history = []
    pending_clarification = None
    response_options = None

    while True:
        is_clarification_reply = False

        if response_options:
            print("\nOptions :")
            for i, opt in enumerate(response_options, 1):
                print(f"  {i}. {opt}")
            raw = input("\nVous (numero, ou texte libre pour changer de sujet): ").strip()
            if raw.lower() in ("exit()", "exit", "quit", "quit()"):
                print("Fin de la session.")
                break
            if raw.isdigit() and 1 <= int(raw) <= len(response_options):
                message = response_options[int(raw) - 1]
                is_clarification_reply = True
            else:
                message = raw  # pas une option valide -> traite comme un message libre (nouvelle intention possible)
        elif pending_clarification:
            # clarification a reponse libre (pas d'options) - simulateur du champ texte du popup
            message = input("\nVous (reponds a la clarification, ou tape 'annuler' pour changer de sujet): ").strip()
            if message.lower() in ("exit()", "exit", "quit", "quit()"):
                print("Fin de la session.")
                break
            if message.lower() not in ("annuler",):
                is_clarification_reply = True
        else:
            message = input("\nVous: ").strip()
            if message.lower() in ("exit()", "exit", "quit", "quit()"):
                print("Fin de la session.")
                break

        if not message:
            continue

        result = app.invoke({
            "message": message,
            "conversation_history": conversation_history,
            "citizen_profile": None,
            "intent": None,
            "response": None,
            "response_options": None,
            "pending_clarification": pending_clarification,
            "is_clarification_reply": is_clarification_reply,
            "user_role": user_role,
            "answer": None,
            "sources": None,
            "collected_profile": None,
        })

        response = result["response"]
        # MonParcours : profiling terminé -> vraie checklist (même rendu que l'API).
        if result["intent"] == "documents_necessaires" and result.get("collected_profile") is not None:
            response = render_checklist(result["collected_profile"], intro=result["response"])

        print(f"\n[intent={result['intent']}]")
        print(f"Assistant: {response}")

        conversation_history.append({"role": "user", "content": message})
        conversation_history.append({"role": "assistant", "content": response})
        pending_clarification = result["pending_clarification"]
        response_options = result["response_options"]
