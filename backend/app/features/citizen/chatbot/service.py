"""Citizen AI Assistant service.

The single seam between the migrated APL RAG engine and MonParcours. Every turn
goes through the RAG LangGraph orchestrator (which classifies intent and, for a
general APL question, runs the hybrid retrieval + grounded generation). The two
intents the engine ships as mocks — questions about the citizen's OWN dossier
(`depot_dossier`) and about a different profile (`autre_profil`) — are answered
here from existing MonParcours services instead, so no MonParcours logic is
duplicated and the engine stays untouched.

Routing (as the engine's classifier decides):
    rag_general   → migrated RAG (answer + structured citations)
    depot_dossier → MonParcours dossier workflow (status + missing pieces)
    autre_profil  → MonParcours profiling feature (redirect)
    fallback      → the engine's static out-of-scope reply
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.features.citizen.chatbot.rag import orchestrator
from app.features.citizen.chatbot.schemas import (
    ChatbotContextSchema,
    ChatbotResponseSchema,
    ChatbotSourceSchema,
    SourceCategory,
)
from app.modules.auth.models import User

# The dossier a citizen assembles in the demo (auto-created on first reference).
_DEFAULT_APPLICATION = "TEST-DOSSIER-0001"
_VALID_CATEGORIES = {c.value for c in SourceCategory}

# The compiled LangGraph is built once (it wires the nodes); the heavy RAG
# pipeline behind `rag_general` stays lazily built inside the orchestrator.
_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        _graph = orchestrator.build_graph()
    return _graph


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
            )
        )
    return sources


def answer_question(
    message: str,
    context: ChatbotContextSchema | None,
    db: Session,
    user: User | None,
) -> ChatbotResponseSchema:
    ctx = context or ChatbotContextSchema()
    history = [{"role": m.role, "content": m.content} for m in ctx.conversation_history]

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
                "answer": None,
                "sources": None,
            }
        )
    except Exception:  # noqa: BLE001 — any engine failure degrades, never crashes
        return ChatbotResponseSchema(
            answer=(
                "L’assistant est momentanément indisponible. Merci de réessayer dans "
                "un instant."
            ),
            sources=[],
        )
    intent = state.get("intent")

    if intent == "rag_general":
        return ChatbotResponseSchema(
            answer=state.get("answer") or state.get("response") or "",
            sources=_to_sources(state.get("sources")),
        )
    if intent == "depot_dossier":
        return ChatbotResponseSchema(answer=_answer_dossier(db, user), sources=[])
    if intent == "autre_profil":
        return ChatbotResponseSchema(answer=_answer_autre_profil(), sources=[])

    # fallback (and any unexpected intent) → the engine's static reply.
    return ChatbotResponseSchema(answer=state.get("response") or "", sources=[])


def _answer_dossier(db: Session, user: User | None) -> str:
    """Reconnect the `depot_dossier` intent to the existing dossier workflow.

    Reuses `submission.get_dossier_review` (status + coherence + decision) and, for
    a dossier not yet submitted, `citizen.service.get_checklist` for the pieces
    still missing. No dossier logic is reimplemented here.
    """
    from app.modules.citizen import service as citizen_service, submission

    review = submission.get_dossier_review(db, _DEFAULT_APPLICATION)

    if not review.submitted:
        checklist = citizen_service.get_checklist(db, _DEFAULT_APPLICATION)
        missing = [doc.libelle for doc in checklist.documents if doc.obligatoire and not doc.received]
        if missing:
            return (
                "Votre dossier n’est pas encore transmis. Il vous manque les pièces "
                "obligatoires suivantes : " + ", ".join(missing) + "."
            )
        return "Votre dossier est complet et prêt à être soumis à l’administration."

    parts = [f"Votre dossier {review.application_number} est au statut « {review.status} »."]
    if review.coherence is not None and review.coherence.score is not None:
        parts.append(f"Score de cohérence du dossier : {review.coherence.score}/100.")
    if review.decision is not None:
        verdict = "validé" if review.decision.outcome == "validated" else "rejeté"
        parts.append(f"Décision de l’agent : dossier {verdict}. {review.decision.explanation}")
    else:
        parts.append("Un agent instruit actuellement votre demande.")
    return " ".join(parts)


def _answer_autre_profil() -> str:
    """Reconnect the `autre_profil` intent to the existing Profiling feature."""
    return (
        "Pour connaître les documents nécessaires à une autre situation que la vôtre "
        "(par exemple pour un proche), utilisez l’assistant de profilage : il construit "
        "une checklist personnalisée à partir du profil que vous décrivez."
    )
