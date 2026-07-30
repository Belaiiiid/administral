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
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END
from .llm_client import call_llm, call_llm_structured, EXPLAIN_OPTION, SKIP_OPTION, _enforce_standard_options
from . import rag_pipeline

# MonParcours : vocabulaire de profil dérivé de `ProfilPartiel`, pour que le
# profiling remplisse exactement les champs dont les règles de checklist se servent.
from ..checklist_answer import PROFILE_FIELDS_DOC
from app.modules.citizen import estimation

# Pas d'authentification (canal WhatsApp notamment) : le chat est un espace ouvert, aucun
# profil connu à l'avance. "Mon dossier" et "le dossier d'un tiers" (ex: mon fils étudiant)
# demandent donc exactement le même traitement - questions de profiling puis documents
# nécessaires - d'où une seule intention `documents_necessaires` au lieu de deux.
# `estimation` suit le même principe : l'assistant est aveugle à l'authentification (voir
# `chatbot/service.py`), donc même un citoyen connecté obtient ici une fourchette par
# tranches, jamais son profil réel — l'estimation à partir de données exactes reste sur
# la page "Envoyer un dossier" (`GET /citizen/estimation`), pas dans la conversation.
VALID_INTENTS = {"documents_necessaires", "rag_general", "estimation", "fallback"}

CLASSIFIER_SYSTEM_PROMPT = """Tu es un classifieur d'intention pour un chatbot d'aide au logement (APL).
Classe le message du citoyen dans EXACTEMENT une de ces 4 catégories :

- documents_necessaires: le citoyen demande quels documents sont nécessaires pour une demande d'APL
  (pour lui-même OU pour une autre personne, ex: son fils étudiant - le chat n'a pas d'authentification,
  donc les deux cas sont traités pareil).
  Exemples: "quels documents pour mon dossier ?", "quels documents pour mon fils étudiant ?",
  "je suis propriétaire, il me faudrait quoi ?"

- estimation: le citoyen veut savoir combien il pourrait toucher, un montant d'aide.
  Exemples: "combien je pourrais toucher ?", "à combien s'élève l'APL pour mon loyer ?",
  "estime mon aide au logement", "quel montant d'APL pour un couple avec un enfant ?"

- rag_general: question générale sur la réglementation, les règles, le fonctionnement de l'APL.
  Exemples: "comment est calculée l'APL ?", "quel est le délai de traitement ?"

- fallback: tout le reste (hors-sujet, ambigu, pas lié au logement).

Réponds UNIQUEMENT avec un JSON de la forme: {"intent": "documents_necessaires"}
"""

GREETING_WORDS = {
    "bonjour", "bonsoir", "salut", "coucou", "hello", "hi", "hey",
    "bjr", "slt", "cc", "yo",
}


def is_greeting(message: str) -> bool:
    """Détection légère par mots-clés (pas de LLM) - le message doit être court et
    essentiellement composé d'un mot de salutation, pour ne pas confondre avec une vraie
    question qui contiendrait accidentellement un mot proche."""
    words = re.findall(r"[a-zà-ÿ]+", message.lower())
    return 0 < len(words) <= 4 and any(w in GREETING_WORDS for w in words)


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
        messages.extend(state["conversation_history"])
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
    except Exception as e:
        print(f"[route_intent_llm] Erreur classification, repli sur fallback: {e}")
        return "fallback"


# --- Noeuds ---
def orchestrator_node(state: D4State) -> D4State:
    pending = state.get("pending_clarification")
    # Reponse structuree au popup de clarification -> on ne reclassifie pas, on renvoie
    # directement au noeud qui avait pose la question (rag_general OU documents_necessaires).
    if state.get("is_clarification_reply") and pending:
        return {**state, "intent": pending["intent"]}
    # Salutation ("Bonjour" etc.) -> pas la peine d'appeler le classifieur LLM, tres frequent
    # en ouverture de conversation WhatsApp et jamais ambigu.
    if is_greeting(state["message"]):
        return {**state, "intent": "fallback"}
    intent = route_intent_llm(state)
    return {**state, "intent": intent}


# MonParcours : la fin du prompt diffère du repo `apl_rag`. Là-bas, le nœud conclut par
# un "[MOCK]" faute de générateur de checklist ; ici il conclut en renvoyant le profil
# collecté, que la couche service passe aux règles de checklist MonParcours. Le LLM
# collecte des faits déclarés, il ne choisit JAMAIS les documents.
DOCUMENTS_SYSTEM_PROMPT = f"""Tu aides un citoyen à savoir quels documents sont nécessaires pour une
demande d'aide au logement (APL) - pour lui-même OU pour une autre personne (ex: son fils étudiant),
les deux cas se traitent pareil.

Le chat n'a pas d'authentification : tu ne connais RIEN sur la situation de la personne concernée au
départ. Avant de pouvoir lister les documents nécessaires, pose des questions de profiling courtes sur
sa situation (statut logement, statut professionnel, situation familiale).

RÈGLES :
- Pose une question de profiling à la fois, jamais plusieurs en même temps.
- Ne pose jamais plus de 4 questions de profiling au total sur une même conversation (regarde
  l'historique fourni pour savoir combien tu en as déjà posées). Si le citoyen répond "Passer cette
  question", ce n'est pas la peine d'insister sur CE point précis - tu peux poser une AUTRE question
  de profiling si une autre info manque encore, dans la limite des 4.
- Priorise les questions qui changent vraiment la liste des documents : le statut du logement, puis
  le statut professionnel, puis la situation familiale.
- Si le citoyen répond "Je ne comprends pas, expliquez-moi" à une question de profiling, explique-la
  en langage très simple (un exemple concret aide), PUIS repose la même question (reformulée plus
  simplement si possible) - ne l'ignore pas et ne devine pas sa situation à sa place.
- Ne liste JAMAIS toi-même les documents : la liste est établie ensuite à partir du profil que tu as
  collecté. Ta réponse finale se limite à une phrase d'introduction courte.

FORMAT DE SORTIE :
Réponds UNIQUEMENT avec un JSON de la forme :
{{"type": "clarification", "text": "la question posée", "options": [...] ou null}}
tant qu'il te manque des informations, ou, quand tu en as assez (ou après la limite) :
{{"type": "answer", "text": "une phrase d'introduction courte", "profil": {{...}}}}
- "options": liste de choix courts (2 à 4) si la question a un nombre limité de réponses plausibles.
  Mets "options": null si la réponse attendue est une valeur libre.
- Ne mets PAS toi-même d'option "passer cette question" ou "je ne comprends pas" dans ta liste -
  elles sont ajoutées automatiquement, inutile de les dupliquer.
- "profil": UNIQUEMENT les champs ci-dessous, et uniquement ceux que le citoyen a réellement indiqués
  (n'invente rien, ne devine rien - un champ absent est traité comme "inconnu") :
{PROFILE_FIELDS_DOC}
"""


def documents_necessaires_node(state: D4State) -> D4State:
    pending = state.get("pending_clarification")
    is_reply = state.get("is_clarification_reply") and pending is not None
    original_question = pending["original_question"] if is_reply else state["message"]

    messages = [{"role": "system", "content": DOCUMENTS_SYSTEM_PROMPT}]
    messages.extend(state["conversation_history"])
    messages.append({"role": "user", "content": state["message"]})

    result = call_llm_structured(messages=messages, temperature=0.2)

    if result["type"] == "clarification":
        return {
            **state,
            "response": result["text"],
            "answer": result["text"],
            "response_options": result["options"],
            "pending_clarification": {"original_question": original_question, "intent": "documents_necessaires"},
            "collected_profile": None,
        }

    # MonParcours : le profil déclaré part vers la couche service, qui produit la vraie
    # checklist. `response` reste la phrase d'introduction du LLM (ce que voit le CLI).
    profile = result.get("profil")
    return {
        **state,
        "response": result["text"],
        "answer": result["text"],
        "response_options": None,
        "pending_clarification": None,
        "collected_profile": profile if isinstance(profile, dict) else {},
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
    juste pour 4 questions à choix fixes."""
    return json.dumps({"estimation_reponses": reponses}, ensure_ascii=False)


def _decode_estimation_state(pending: Optional[dict]) -> dict:
    if not pending:
        return {}
    try:
        parsed = json.loads(pending.get("original_question") or "")
        reponses = parsed.get("estimation_reponses")
        return reponses if isinstance(reponses, dict) else {}
    except (json.JSONDecodeError, TypeError, AttributeError):
        return {}


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
    except Exception as e:  # noqa: BLE001 — l'estimation ne doit jamais planter la conversation
        print(f"[estimation_node] Erreur de calcul, repli sur message d'excuse: {e}")
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


SHOW_SOURCES = True  # bascule simple : afficher ou non les sources au citoyen


def rag_general_node(state: D4State) -> D4State:
    pending = state.get("pending_clarification")
    is_reply = state.get("is_clarification_reply") and pending is not None

    if is_reply:
        # on combine la question d'origine (pour un bon retrieval) avec la reponse au popup
        original_question = pending["original_question"]
        query = f"{original_question} {state['message']}"
    else:
        original_question = state["message"]
        query = state["message"]

    role = state.get("user_role") or "citizen"
    categories = CATEGORIES_BY_ROLE.get(role, CATEGORIES_BY_ROLE["citizen"])
    result = get_rag_pipeline().answer(query, category=categories, conversation_history=state["conversation_history"])

    if result["type"] == "clarification":
        return {
            **state,
            "response": result["text"],
            "answer": result["text"],
            "sources": [],  # une clarification n'est pas une réponse sourcée
            "response_options": result["options"],
            "pending_clarification": {"original_question": original_question, "intent": "rag_general"},
        }

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
            }

    return {
        **state,
        "response": response,
        "answer": result["text"],
        "sources": list(structured.values()),
        "response_options": None,
        "pending_clarification": None,
    }


GREETING_RESPONSE = (
    "Bonjour ! Je peux vous aider sur l'aide au logement (APL) : questions générales sur la "
    "réglementation, ou documents nécessaires pour une demande. Que puis-je faire pour vous ?"
)
FALLBACK_RESPONSE = (
    "Je ne peux pas répondre à cette question. Je peux vous aider sur les documents nécessaires "
    "pour une demande d'APL, ou des questions générales sur l'aide au logement."
)


def fallback_node(state: D4State) -> D4State:
    response = GREETING_RESPONSE if is_greeting(state["message"]) else FALLBACK_RESPONSE
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
    graph.add_node("fallback", fallback_node)

    graph.set_entry_point("orchestrator")

    graph.add_conditional_edges(
        "orchestrator",
        lambda state: state["intent"],
        {
            "documents_necessaires": "documents_necessaires",
            "estimation": "estimation",
            "rag_general": "rag_general",
            "fallback": "fallback",
        },
    )

    for node_name in ["documents_necessaires", "estimation", "rag_general", "fallback"]:
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
