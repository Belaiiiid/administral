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

- **Le compte ne sert qu'à deux choses, et elles sont énumérées ici.** D'abord le
  RÔLE (citoyen ou agent). Ensuite, depuis l'ajout de `profil_enregistre`, le
  profil DÉCLARATIF déjà saisi par le citoyen sur la plateforme
  (`citizens.profile_data`) — et rien d'autre : ni dossier, ni pièces déposées,
  ni décisions, ni identité. Ce profil n'est jamais utilisé en silence : il est
  relu au citoyen, qui le confirme ou le rejette, avant que la moindre pièce en
  soit déduite (voir `orchestrator.documents_necessaires_node`).

  Sans compte, rien n'est lu et le comportement est exactement celui d'avant :
  c'est ce qui laisse le même moteur servir un canal sans authentification
  (WhatsApp). Et poser une question "pour mon fils étudiant" reste possible —
  c'est le sens de l'option « C'est pour quelqu'un d'autre », qui rend la main à
  l'entretien ordinaire. Le suivi du dossier réel reste dans l'espace citoyen,
  qui n'est pas touché.
- **Le backend ne garde aucune session.** L'historique ET l'état de clarification
  font l'aller-retour par le client (voir `schemas`).
"""

from __future__ import annotations

import threading
import time

from app.core.logger import logger
from app.modules.auth.models import Role, User
from app.modules.chatbot import profil_enregistre
from app.modules.chatbot.checklist_answer import render_checklist
from app.modules.chatbot.rag import budget, orchestrator
from app.modules.chatbot.schemas import (
    ChatbotContextSchema,
    ChatbotCtaSchema,
    ChatbotResponseSchema,
    ChatbotSourceSchema,
    PendingClarificationSchema,
    SourceCategory,
)

_VALID_CATEGORIES = {c.value for c in SourceCategory}

# The compiled LangGraph is built once (it wires the nodes); the heavy RAG
# pipeline behind `rag_general` stays lazily built inside the orchestrator.
_graph = None
#: Le endpoint est synchrone, donc servi par un pool de threads : sans verrou, deux
#: premières requêtes simultanées compilaient chacune leur graphe. Peu coûteux ici
#: (le graphe ne fait que câbler les nœuds), mais c'est le même défaut que sur les
#: singletons lourds et il ne coûte rien de le fermer aussi.
_graph_lock = threading.Lock()


def _get_graph():
    global _graph
    if _graph is None:
        with _graph_lock:
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


# Les intentions qui décrivent une démarche APL : ce sont les seules où enchaîner sur
# la constitution du dossier a du sens. Une question de droit ou un hors-sujet n'appelle
# pas un bouton "déposer mes pièces".
_INTENTS_AVEC_SUITE = {"rag_general", "documents_necessaires", "estimation"}


def _cta(intent: str | None, user: User | None, en_clarification: bool) -> ChatbotCtaSchema | None:
    """L'action à proposer sous la réponse, ou None.

    Rien pendant une clarification : le citoyen est en train de répondre à une
    question, lui présenter un bouton au milieu du dialogue le détourne."""
    if en_clarification or intent not in _INTENTS_AVEC_SUITE:
        return None
    if user is not None:
        return ChatbotCtaSchema(
            label="Constituer mon dossier",
            href="/mon-dossier",
            hint="Vous pouvez déposer vos pièces et suivre votre demande ici.",
        )
    return ChatbotCtaSchema(
        label="Créer mon compte",
        href="/register",
        hint=(
            "Vous pouvez faire votre demande sur caf.fr, ou la préparer ici : "
            "MonParcours vous indique les pièces à fournir et vérifie votre dossier "
            "avant l'envoi."
        ),
    )


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
            # décision contestée, la confirmation du profil enregistré) ; None pour
            # celles écrites par le LLM.
            "step": ctx.pending_clarification.step,
        }
        if ctx.pending_clarification
        else None
    )

    # Safety net: intent routing already falls back on LLM failure, but the
    # generation step (Mistral) can still raise if the API is unavailable. The
    # assistant must degrade to a message, never a 500 — a broken chatbot mid-demo
    # is worse than a graceful "try again".
    #
    # Le filet ne doit pas pour autant AVALER la panne : « momentanément
    # indisponible » côté citoyen et rien du tout côté équipe, c'est un incident
    # qu'on ne peut ni compter ni comprendre. Le message reste identique pour le
    # citoyen, la cause est écrite dans les logs.
    # Disjoncteur de dépense : passé le budget du jour, on n'appelle plus le modèle du
    # tout. Vérifié ICI et non dans `call_llm`, parce que le classifieur rattrape toute
    # exception et retomberait sur « hors-sujet » — le citoyen recevrait un refus de
    # sujet au lieu d'une indisponibilité, et la question irait grossir le journal des
    # questions sans réponse comme si le corpus était en cause.
    if budget.depasse():
        return _unavailable()

    # Le profil déjà saisi par le citoyen sur la plateforme, s'il est connecté. Lu ICI,
    # avant le graphe, dans une session brève qui se referme aussitôt : le tour ne doit
    # pas retenir de connexion PostgreSQL pendant qu'il attend le modèle (voir
    # `profil_enregistre`). Vaut None pour un visiteur anonyme, et l'entretien se
    # déroule alors exactement comme avant.
    profil_connu = profil_enregistre.pour(user)

    debut = time.perf_counter()
    try:
        state = _get_graph().invoke(
            {
                "message": message,
                "conversation_history": history,
                "citizen_profile": profil_connu,
                "intent": None,
                "response": None,
                "response_options": None,
                "pending_clarification": pending,
                # Vient de l'UI telle quelle : elle seule sait si le citoyen a cliqué un
                # choix ou écrit sa réponse. Elle rapporte ce fait ; c'est le moteur qui
                # en tire une conclusion (voir `orchestrator._repond_a_la_clarification`).
                "clarification_reply": ctx.clarification_reply,
                "user_role": _user_role(user),
                "answer": None,
                "sources": None,
                "collected_profile": None,
                # Branche juridique : quel droit servir (celui de la décision contestée)
                # et si la question a déjà été tranchée dans cette conversation.
                # Le moteur transporte cette date en ISO, pas en `date` : son état fait
                # l'aller-retour par le client en JSON et doit rester sérialisable tel
                # quel, y compris pour un canal qui n'aurait pas de couche Pydantic.
                # La validation, elle, appartient à la frontière HTTP (voir `schemas`).
                "date_reference": ctx.date_reference.isoformat() if ctx.date_reference else None,
                "date_asked": ctx.date_asked,
            }
        )
    except Exception:  # noqa: BLE001 — any engine failure degrades, never crashes
        logger.exception(
            "chatbot: échec du moteur",
            {
                "etape": "graph",
                "mode_recherche": orchestrator.mode_recherche(),
                "duree_ms": round((time.perf_counter() - debut) * 1000),
                "role": _user_role(user),
                "en_clarification": pending is not None,
            },
        )
        return _unavailable()

    intent = state.get("intent")
    answer = state.get("answer") or state.get("response") or ""

    # Profiling terminé : le profil déclaré devient la vraie checklist MonParcours.
    # `collected_profile` vaut None tant que le profiling pose encore des questions.
    if intent == "documents_necessaires" and state.get("collected_profile") is not None:
        try:
            answer = render_checklist(state["collected_profile"], intro=answer)
        except Exception:  # noqa: BLE001 — la checklist ne doit pas casser la réponse
            logger.exception(
                "chatbot: échec du rendu de la checklist",
                {"etape": "checklist", "champs_collectes": sorted(state["collected_profile"])},
            )
            return _unavailable()

    next_pending = state.get("pending_clarification")
    sources = _to_sources(state.get("sources"))

    # Une ligne par tour : de quoi suivre la santé de l'assistant sans rien lire de ce
    # que le citoyen a écrit. Le CONTENU n'a qu'un seul endroit légitime, le journal des
    # questions sans réponse, qui existe pour ça et ne consigne aucune identité. Ici on
    # ne garde que des métriques : la branche empruntée, le mode de recherche effectif
    # (une bascule durable en BM25 seul ne se voit nulle part ailleurs), le temps de
    # réponse, et si le tour a produit une question plutôt qu'une réponse.
    logger.info(
        "chatbot: tour traité",
        {
            "intent": intent,
            "mode_recherche": orchestrator.mode_recherche(),
            "duree_ms": round((time.perf_counter() - debut) * 1000),
            "role": _user_role(user),
            "sources": len(sources),
            "clarification": next_pending is not None,
        },
    )

    return ChatbotResponseSchema(
        answer=answer,
        sources=sources,
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
        cta=_cta(intent, user, en_clarification=next_pending is not None),
    )
