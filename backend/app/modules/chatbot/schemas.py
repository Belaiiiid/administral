"""Wire contract for the citizen assistant.

Le contrat de base est inchangé (mêmes champs, même camelCase) : le frontend
existant continue de fonctionner. Ce qui s'ajoute vient de la clarification
structurée du moteur migré (popup à choix, cf. décisions 7 et 14 du CLAUDE.md
d'`apl_rag`) :

- réponse : `options` (les choix à afficher) et `pendingClarification` (à quoi la
  prochaine réponse se rattache) ;
- requête : `isClarificationReply` — **injecté par l'UI, jamais déduit du texte**
  — qui fait contourner le classifieur d'intention, et `pendingClarification`
  renvoyé tel quel.

Le backend ne garde aucune session : comme `conversationHistory`, l'état de
clarification fait l'aller-retour par le client. C'est ce qui permet au même
moteur de servir le portail web et un canal sans session (WhatsApp).
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Literal

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
    #: Corpus juridique (Legifrance), réservé au rôle agent — voir
    #: `orchestrator.CATEGORIES_BY_ROLE`. Le filtre est en place, le corpus pas
    #: encore alimenté : la catégorie est déclarée pour ne pas avoir à modifier
    #: le contrat le jour où il l'est.
    legislation = "legislation"


class ChatbotSourceSchema(CamelModel):
    title: str
    category: SourceCategory


class ChatMessageSchema(CamelModel):
    """One prior turn, sent as context."""

    role: str
    content: str


class PendingClarificationSchema(CamelModel):
    """La clarification à laquelle le prochain message répond.

    Émise par le backend avec une question de clarification, puis renvoyée telle
    quelle par l'UI avec la réponse du citoyen. `intent` est volontairement borné
    aux deux nœuds qui posent des questions : il vient du client et court-circuite
    le classifieur, il ne doit donc pas pouvoir désigner autre chose.
    """

    original_question: str
    intent: Literal["rag_general", "documents_necessaires"]


class ChatbotContextSchema(CamelModel):
    case_id: str | None = None
    case_status: str | None = None
    conversation_history: list[ChatMessageSchema] = Field(default_factory=list)
    pending_clarification: PendingClarificationSchema | None = None
    #: True uniquement quand le message vient du popup de clarification (clic sur
    #: une option ou saisie dans le champ dédié). Jamais déduit du contenu du
    #: message côté backend — c'est l'UI qui sait d'où vient la réponse.
    is_clarification_reply: bool = False


class ChatbotRequestSchema(CamelModel):
    message: str = Field(min_length=1, max_length=2000)
    context: ChatbotContextSchema | None = None


class ChatbotResponseSchema(CamelModel):
    answer: str
    #: Empty when the assistant answered without grounding (fallback, dossier
    #: routing). An empty list is a meaningful state the UI renders, not an error.
    sources: list[ChatbotSourceSchema]
    #: Choix à proposer au citoyen quand la réponse est une question de
    #: clarification. `None` = réponse finale, ou question à réponse libre.
    options: list[str] | None = None
    #: Non nul tant que l'assistant attend une réponse à sa question.
    pending_clarification: PendingClarificationSchema | None = None


class ChatHistoryMessageSchema(CamelModel):
    """One turn of a citizen's persisted conversation (see `history.py`).

    Distinct from `ChatMessageSchema`: that one is the minimal shape the
    client resends as context on the *next* question, this one is what the
    client reads back to redraw the thread (id for React keys, sources for
    the citation block, a timestamp).
    """

    id: int
    role: Literal["user", "assistant"]
    content: str
    sources: list[ChatbotSourceSchema] | None = None
    created_at: datetime
