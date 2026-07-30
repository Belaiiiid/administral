"""Citizen AI Assistant service.

The single seam between the migrated APL RAG engine and MonParcours. Every turn
goes through the RAG LangGraph orchestrator, which classifies the message into
one of three intents and answers it:

    rag_general           → retrieval hybride + génération sourcée (moteur RAG)
    documents_necessaires → profiling structuré, puis la VRAIE checklist
                            MonParcours (`checklist_answer.render_checklist`)
    fallback              → hors-sujet, ou accueil si le message est une salutation

Deux points structurants, hérités des décisions du moteur (voir le CLAUDE.md
d'`apl_rag`) :

- **L'assistant est aveugle à l'authentification.** Le compte connecté ne sert
  qu'à une chose ici : déterminer le RÔLE (citoyen ou agent), qui élargit le
  corpus interrogeable. Aucun dossier, aucun `citizen_id`, aucun profil stocké
  n'entre dans la conversation : le profil utilisé pour la checklist est
  uniquement celui que la personne déclare pendant l'échange. Le comportement est
  donc identique sur le portail web et sur un canal sans compte (WhatsApp), et
  poser une question "pour mon fils étudiant" marche exactement comme pour soi.
  Le suivi du dossier réel reste dans l'espace citoyen, qui n'est pas touché.
- **Le backend ne garde aucune session.** L'historique ET l'état de clarification
  font l'aller-retour par le client (voir `schemas`).
"""

from __future__ import annotations

from app.modules.auth.models import Role, User
from app.modules.chatbot.checklist_answer import render_checklist
from app.modules.chatbot.rag import orchestrator
from app.modules.chatbot.schemas import (
    ChatbotContextSchema,
    ChatbotResponseSchema,
    ChatbotSourceSchema,
    PendingClarificationSchema,
    SourceCategory,
)

_VALID_CATEGORIES = {c.value for c in SourceCategory}

# The compiled LangGraph is built once (it wires the nodes); the heavy RAG
# pipeline behind `rag_general` stays lazily built inside the orchestrator.
_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        _graph = orchestrator.build_graph()
    return _graph


def _user_role(user: User | None) -> str:
    """Rôle au sens du moteur RAG : il ne pilote que l'étendue du corpus.

    Un agent (ou un admin, admis partout où un agent l'est) peut interroger le
    corpus juridique en plus des sources vulgarisées ; un visiteur non connecté
    est traité comme un citoyen. C'est le seul usage fait du compte."""
    if user is not None and user.role in (Role.AGENT, Role.ADMIN):
        return "agent"
    return "citizen"


def _to_sources(raw: list | None) -> list[ChatbotSourceSchema]:
    """Map the RAG's structured citations onto the wire schema, clamping any
    unknown corpus category to `demarche` so a new source can never 500 the UI."""
    sources: list[ChatbotSourceSchema] = []
    for item in raw or []:
        category = item.get("category")
        sources.append(
            ChatbotSourceSchema(
                title=item.get("title") or "Source",
                category=category if category in _VALID_CATEGORIES else "demarche",
                url=item.get("url") or "",
            )
        )
    return sources


def _unavailable() -> ChatbotResponseSchema:
    return ChatbotResponseSchema(
        answer=(
            "L’assistant est momentanément indisponible. Merci de réessayer dans "
            "un instant."
        ),
        sources=[],
    )


def answer_question(
    message: str,
    context: ChatbotContextSchema | None,
    user: User | None,
) -> ChatbotResponseSchema:
    ctx = context or ChatbotContextSchema()
    history = [{"role": m.role, "content": m.content} for m in ctx.conversation_history]
    pending = (
        {
            "original_question": ctx.pending_clarification.original_question,
            "intent": ctx.pending_clarification.intent,
            # `step` n'existe que pour les questions posées par le code (la date d'une
            # décision contestée) ; None pour celles écrites par le LLM.
            "step": ctx.pending_clarification.step,
        }
        if ctx.pending_clarification
        else None
    )

    # Safety net: intent routing already falls back on LLM failure, but the
    # generation step (Mistral) can still raise if the API is unavailable. The
    # assistant must degrade to a message, never a 500 — a broken chatbot mid-demo
    # is worse than a graceful "try again".
    try:
        state = _get_graph().invoke(
            {
                "message": message,
                "conversation_history": history,
                "citizen_profile": None,
                "intent": None,
                "response": None,
                "response_options": None,
                "pending_clarification": pending,
                # Le flag vient de l'UI telle quelle : c'est elle qui sait si le
                # message est une réponse au popup, et lui seul fait contourner le
                # classifieur (décision 7).
                "is_clarification_reply": ctx.is_clarification_reply,
                "user_role": _user_role(user),
                "answer": None,
                "sources": None,
                "collected_profile": None,
                # Branche juridique : quel droit servir (celui de la décision contestée)
                # et si la question a déjà été tranchée dans cette conversation.
                "date_reference": ctx.date_reference,
                "date_asked": ctx.date_asked,
            }
        )
    except Exception:  # noqa: BLE001 — any engine failure degrades, never crashes
        return _unavailable()

    intent = state.get("intent")
    answer = state.get("answer") or state.get("response") or ""

    # Profiling terminé : le profil déclaré devient la vraie checklist MonParcours.
    # `collected_profile` vaut None tant que le profiling pose encore des questions.
    if intent == "documents_necessaires" and state.get("collected_profile") is not None:
        try:
            answer = render_checklist(state["collected_profile"], intro=answer)
        except Exception:  # noqa: BLE001 — la checklist ne doit pas casser la réponse
            return _unavailable()

    next_pending = state.get("pending_clarification")
    return ChatbotResponseSchema(
        answer=answer,
        sources=_to_sources(state.get("sources")),
        options=state.get("response_options"),
        pending_clarification=(
            PendingClarificationSchema(
                original_question=next_pending["original_question"],
                intent=next_pending["intent"],
                step=next_pending.get("step"),
            )
            if next_pending
            else None
        ),
        date_reference=state.get("date_reference"),
        date_asked=bool(state.get("date_asked")),
    )
