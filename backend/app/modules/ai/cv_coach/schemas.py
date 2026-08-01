"""Schemas for the CV coach (France Travail): the chat turn and the
structured CV review."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class CvCoachTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class CvCoachChatRequest(BaseModel):
    message: str
    conversation_history: list[CvCoachTurn] = Field(default_factory=list)


class CvCoachChatResponse(BaseModel):
    reply: str


class CvReviewResult(CamelModel):
    """Structured feedback on an uploaded CV — never a rewritten CV.

    `available` is false whenever no real review ran (no Mistral key, an
    unreadable CV, a model failure); every other field is then left empty
    rather than carrying a fabricated verdict — same contract as
    `ai.job_match.schemas.JobMatchAnalysis`.
    """

    available: bool
    unavailable_reason: str | None = None
    points_forts: list[str] = Field(default_factory=list)
    points_a_ameliorer: list[str] = Field(default_factory=list)
    conseils: list[str] = Field(default_factory=list)
