"""Wire contract for the citizen assistant.

Mirrors ``frontend/src/features/chatbot/types/chatbot.ts`` field for field.

Note what the response does **not** carry: no model name, no confidence score,
no retrieved passages, no prompt, no token accounting. The frontend knows there
is an endpoint that answers questions with sources, and nothing further. If the
retrieval strategy or the model behind it changes, this file does not.
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
    """The corpus a source belongs to.

    Drives the label shown next to a citation, so a citizen can tell an official
    regulation from a practical how-to.
    """

    demarche = "demarche"
    reglementation = "reglementation"
    document = "document"
    faq = "faq"


class ChatbotSourceSchema(CamelModel):
    """Where an answer came from, as shown to the citizen.

    Deliberately says nothing about *how* the passage was found. The retrieval
    may be vector similarity, keyword matching, or a hand-written FAQ — the
    citizen is told which document answered them, and the UI renders the same
    thing either way.
    """

    title: str
    category: SourceCategory


class ChatMessageSchema(CamelModel):
    """One prior turn, sent as context."""

    role: str
    content: str


class ChatbotContextSchema(CamelModel):
    """What the client knows about the citizen's situation.

    All fields optional: the assistant answers general questions without any of
    them. A field is populated only when the value is genuinely known; an absent
    field means "unknown", never "assume a default".
    """

    case_id: str | None = None
    case_status: str | None = None
    conversation_history: list[ChatMessageSchema] = Field(default_factory=list)


class ChatbotRequestSchema(CamelModel):
    message: str = Field(min_length=1, max_length=2000)
    context: ChatbotContextSchema | None = None


class ChatbotResponseSchema(CamelModel):
    answer: str
    #: Empty when the assistant answered without grounding — a refusal, say.
    #: An empty list is a meaningful state the UI renders, not an error.
    sources: list[ChatbotSourceSchema]
