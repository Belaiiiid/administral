"""Citizen assistant business logic.

The assistant is a *consultation* surface. It answers questions about
procedures, documents and the meaning of administrative terms. It does not
modify an application, compute an entitlement, or rule on eligibility — and
there is no code path here through which it could. The narrow surface is the
guarantee, not a comment asking for restraint.

Flow, with the seam a model will occupy marked:

    question → normalise → retrieve (knowledge base / future RAG)
                        → compose  (templates / future Mistral)
                        → {answer, sources}
"""

from __future__ import annotations

from app.modules.ai.chatbot import knowledge_base as kb
from app.modules.ai.chatbot.schemas import (
    ChatbotContextSchema,
    ChatbotResponseSchema,
    ChatbotSourceSchema,
)


def answer_question(
    message: str,
    context: ChatbotContextSchema | None = None,
) -> ChatbotResponseSchema:
    """Answer a citizen's question, grounded in retrieved sources."""
    question = kb.normalise(message)

    # Context is *used*, not invented. A personal question with no case attached
    # gets the limit stated plainly, followed by the general rule if one
    # matches — never a narration of a file the assistant cannot see.
    if kb.is_about_their_own_case(question) and not (context and context.case_id):
        general = kb.retrieve(question)

        if general is None:
            return ChatbotResponseSchema(
                answer=kb.NO_CASE_CONTEXT_ANSWER,
                sources=list(kb.NO_CASE_CONTEXT_SOURCES),
            )

        return ChatbotResponseSchema(
            answer=(
                f"{kb.NO_CASE_CONTEXT_PREFIX} Voici toutefois ce qui s’applique de "
                f"manière générale. {general.answer}"
            ),
            sources=list(general.sources),
        )

    entry = kb.retrieve(question)

    if entry is None:
        # A documented refusal, with no sources — never a plausible guess.
        return ChatbotResponseSchema(answer=kb.NO_ANSWER, sources=[])

    return ChatbotResponseSchema(
        answer=entry.answer,
        sources=[ChatbotSourceSchema(title=s.title, category=s.category) for s in entry.sources],
    )
