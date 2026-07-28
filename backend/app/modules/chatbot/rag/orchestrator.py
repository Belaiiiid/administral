"""
Squelette de l'orchestrateur D4, version 1 : routeur PROVISOIRE à base de
règles simples (mots-clés), sans appel LLM. But : valider que le câblage
des 4 branches fonctionne avant de brancher le vrai classifieur Mistral.

A remplacer à l'étape 2 par une vraie classification LLM.
"""
from typing import TypedDict, Literal, Optional
import json
from langgraph.graph import StateGraph, END
from .llm_client import call_llm
from . import rag_pipeline

VALID_INTENTS = {"depot_dossier", "autre_profil", "rag_general", "fallback"}

CLASSIFIER_SYSTEM_PROMPT = """Tu es un classifieur d'intention pour un chatbot d'aide au logement (APL).
Classe le message du citoyen dans EXACTEMENT une de ces 4 catégories :

- depot_dossier: le citoyen parle de SON PROPRE dossier/sa propre demande : où le déposer,
  quels documents LUI sont demandés, quelle est SON estimation de montant.
  Exemples: "quels documents pour mon dossier ?", "où déposer ma demande ?", "combien je vais toucher ?"

- autre_profil: le citoyen décrit une situation qui n'est PAS la sienne (une autre personne,
  un profil hypothétique) et demande des documents/infos pour CE profil.
  Exemples: "quels documents pour mon fils étudiant ?", "et si j'étais propriétaire, il faudrait quoi ?"

- rag_general: question générale sur la réglementation, les règles, le fonctionnement de l'APL,
  sans lien avec un dossier précis (soi ou un tiers).
  Exemples: "comment est calculée l'APL ?", "quel est le délai de traitement ?"

- fallback: tout le reste (hors-sujet, ambigu, pas lié au logement).

Réponds UNIQUEMENT avec un JSON de la forme: {"intent": "depot_dossier"}
"""


class D4State(TypedDict):
    message: str                        # question posée par le citoyen
    conversation_history: list[dict]     # tours précédents [{"role": "user"|"assistant", "content": ...}]
    citizen_profile: Optional[dict]      # profil du citoyen si connu (injecté par le flux principal)
    intent: Optional[str]                # rempli par l'orchestrateur
    response: Optional[str]              # réponse finale
    # Champs additifs pour la couche API MonParcours (le chat CLI n'en dépend
    # pas) : réponse "propre" sans le suffixe "Sources: ..." et citations
    # structurées {title, category}. Renseignés seulement par rag_general.
    answer: Optional[str]
    sources: Optional[list]


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
    intent = route_intent_llm(state)
    return {**state, "intent": intent}


# NOTE: in MonParcours these two intents are answered by the service layer
# (`chatbot/service.py` → `_answer_dossier` / `_answer_autre_profil`), which reads
# the citizen's real dossier and the profiling feature. The graph still routes to
# these nodes, but `service.answer_question` overrides their output for the API —
# so the strings below are only ever seen by the standalone dev CLI in `__main__`.
# They are honest guidance, not mock data.
def depot_dossier_node(state: D4State) -> D4State:
    return {
        **state,
        "response": (
            "Le suivi de votre dossier (statut, cohérence, décision) est disponible "
            "dans votre espace citoyen."
        ),
    }


def autre_profil_node(state: D4State) -> D4State:
    return {
        **state,
        "response": (
            "Pour une autre situation que la vôtre, utilisez l’assistant de profilage : "
            "il construit une checklist personnalisée à partir du profil décrit."
        ),
    }


_rag_pipeline_instance = None


def get_rag_pipeline():
    """Lazy singleton : le pipeline (index BM25+Qdrant, modèle d'embeddings)
    n'est construit qu'à la première question qui en a réellement besoin."""
    global _rag_pipeline_instance
    if _rag_pipeline_instance is None:
        _rag_pipeline_instance = rag_pipeline.RagPipeline()
    return _rag_pipeline_instance


def rag_general_node(state: D4State) -> D4State:
    result = get_rag_pipeline().answer(state["message"], conversation_history=state["conversation_history"])
    sources_str = ", ".join(result["sources"])
    response = f"{result['answer']}\n\nSources: {sources_str}"
    # Additif : citations structurées {title, category} dédupliquées par source,
    # dérivées des chunks retrouvés — consommées par la couche API (le chat CLI
    # continue d'utiliser `response` avec les URLs en suffixe, inchangé).
    structured = {}
    for chunk, _score in result["retrieved_chunks"]:
        url = chunk.get("source_url")
        if url and url not in structured:
            structured[url] = {
                "title": chunk.get("source_title") or url,
                "category": chunk.get("category", "demarche"),
            }
    return {**state, "response": response, "answer": result["answer"], "sources": list(structured.values())}


def fallback_node(state: D4State) -> D4State:
    return {**state, "response": "Je ne peux pas répondre à cette question. Je peux vous aider sur votre dossier APL, les documents nécessaires, ou des questions générales sur l'aide au logement."}


# --- Construction du graphe ---
def build_graph():
    graph = StateGraph(D4State)

    graph.add_node("orchestrator", orchestrator_node)
    graph.add_node("depot_dossier", depot_dossier_node)
    graph.add_node("autre_profil", autre_profil_node)
    graph.add_node("rag_general", rag_general_node)
    graph.add_node("fallback", fallback_node)

    graph.set_entry_point("orchestrator")

    graph.add_conditional_edges(
        "orchestrator",
        lambda state: state["intent"],
        {
            "depot_dossier": "depot_dossier",
            "autre_profil": "autre_profil",
            "rag_general": "rag_general",
            "fallback": "fallback",
        },
    )

    for node_name in ["depot_dossier", "autre_profil", "rag_general", "fallback"]:
        graph.add_edge(node_name, END)

    return graph.compile()


if __name__ == "__main__":
    app = build_graph()

    print("Chat interactif (orchestrateur D4). Tapez exit() pour quitter.")
    conversation_history = []

    while True:
        message = input("\nVous: ").strip()
        if not message:
            continue
        if message.lower() in ("exit()", "exit", "quit", "quit()"):
            print("Fin de la session.")
            break

        result = app.invoke({
            "message": message,
            "conversation_history": conversation_history,
            "citizen_profile": None,
            "intent": None,
            "response": None,
        })

        print(f"[intent={result['intent']}]")
        print(f"Assistant: {result['response']}")

        conversation_history.append({"role": "user", "content": message})
        conversation_history.append({"role": "assistant", "content": result["response"]})