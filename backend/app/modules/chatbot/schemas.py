"""Wire contract for the citizen assistant.

Unchanged from the previous assistant so the existing chatbot frontend
(`frontend/src/features/chatbot/`) is drop-in: same request/response shapes,
same camelCase on the wire. What changed is only what answers behind it — the
migrated APL RAG rather than the keyword knowledge base.
"""

from __future__ import annotations

import enum

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class SourceCategory(str, enum.Enum):
    demarche = "demarche"
    reglementation = "reglementation"
    document = "document"
    faq = "faq"


class ChatbotSourceSchema(CamelModel):
    title: str
    category: SourceCategory


class ChatMessageSchema(CamelModel):
    """One prior turn, sent as context."""

    role: str
    content: str


class ChatbotContextSchema(CamelModel):
    case_id: str | None = None
    case_status: str | None = None
    conversation_history: list[ChatMessageSchema] = Field(default_factory=list)


class ChatbotRequestSchema(CamelModel):
    message: str = Field(min_length=1, max_length=2000)
    context: ChatbotContextSchema | None = None


class ChatbotResponseSchema(CamelModel):
    answer: str
    #: Empty when the assistant answered without grounding (fallback, dossier
    #: routing). An empty list is a meaningful state the UI renders, not an error.
    sources: list[ChatbotSourceSchema]
