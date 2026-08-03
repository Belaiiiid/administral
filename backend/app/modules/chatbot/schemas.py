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

from pydantic import BaseModel, ConfigDict, Field, field_validator
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
    #: Corpus juridique (Légifrance), 319 chunks. Porté par les réponses de la branche
    #: `fondement_juridique` UNIQUEMENT — c'est la seule qui sache de quelle VERSION du
    #: texte elle parle, parce qu'elle sert l'article depuis le graphe et non depuis le
    #: chunk indexé. Aucun rôle n'y accède par `rag_general` : voir
    #: `orchestrator.CATEGORIES_BY_ROLE`, où cette restriction est justifiée.
    #: (Ce commentaire a longtemps annoncé un corpus « pas encore alimenté » ; il l'était,
    #: et l'écart entre les deux a masqué le contournement corrigé depuis.)
    legislation = "legislation"


class ChatbotSourceSchema(CamelModel):
    title: str
    category: SourceCategory
    url: str


class ChatbotCtaSchema(CamelModel):
    """L'action que le citoyen peut enchaîner ici, sur MonParcours.

    L'assistant explique une démarche ; sans ce bouton, il la laisse repartir vers
    un site externe alors que la plateforme sert justement à constituer le dossier.
    Volontairement une SEULE action, décidée côté serveur : proposer trois liens
    revient à ne rien proposer.

    C'est un élément d'interface, pas de contenu : il ne dépend jamais du dossier
    ni du profil du citoyen (l'assistant reste aveugle à l'authentification, cf.
    `service`), seulement de la présence d'une session — connecté, on l'emmène à
    son dossier ; sinon, on l'invite à en créer un.
    """

    label: str
    href: str
    #: Phrase d'accompagnement affichée au-dessus du bouton.
    hint: str | None = None


#: Longueur au-delà de laquelle un tour passé est TRONQUÉ (pas rejeté). Une réponse
#: juridique longue ne doit pas rendre invalide le message suivant du citoyen : refuser
#: bloquerait la conversation pour une faute qui n'est pas la sienne.
CONTENT_MAX = 4000
#: Bord extérieur, celui-là rejeté : au-delà, ce n'est plus une conversation, c'est une
#: charge utile. Sert à ne pas ingérer des mégaoctets avant de les tronquer.
CONTENT_ABSURDE = 20_000
#: Le client envoie déjà les 6 derniers tours (`chatbotService.ts`). La borne est haute
#: exprès : elle n'existe pas pour ajuster le contexte mais pour empêcher l'abus.
HISTORIQUE_MAX = 20


class ChatMessageSchema(CamelModel):
    """One prior turn, sent as context.

    CE QUE LE CLIENT ENVOIE ICI EST RECOPIÉ DANS LE PROMPT. C'est ce qui rend `role`
    critique : `system` n'est pas un rôle de conversation, c'est la couche d'instructions
    du modèle. Laissé libre, il permettait à n'importe quel appelant — l'endpoint est
    ouvert, sans compte — d'ajouter ses propres consignes à toutes les branches, y compris
    la branche juridique qui affiche des sources Légifrance sous sa réponse.

    Le rôle est donc REFUSÉ s'il sort du vocabulaire ; le contenu, lui, est TRONQUÉ.
    Les deux fautes n'ont pas le même auteur : un rôle inconnu ne peut venir que d'un
    client qui invente, tandis qu'un contenu trop long peut n'être qu'une réponse
    précédente un peu bavarde."""

    role: Literal["user", "assistant"]
    content: str = Field(max_length=CONTENT_ABSURDE)

    @field_validator("content")
    @classmethod
    def _tronquer(cls, valeur: str) -> str:
        return valeur[:CONTENT_MAX]


class PendingClarificationSchema(CamelModel):
    """La clarification à laquelle le prochain message répond.

    Émise par le backend avec une question de clarification, puis renvoyée telle
    quelle par l'UI avec la réponse du citoyen. `intent` est volontairement borné
    aux nœuds qui posent des questions : il vient du client et court-circuite
    le classifieur, il ne doit donc pas pouvoir désigner autre chose.
    """

    #: Renvoyé tel quel par le client, puis concaténé dans la requête de recherche et
    #: servi comme question à la branche juridique — donc borné, comme `message`. Il
    #: porte aussi, selon la branche, l'état encodé du dialogue (`etat_dialogue`), d'où
    #: une borne plus large que les 2000 caractères d'un message : elle doit couvrir la
    #: question ET les réponses déjà données, elles-mêmes tronquées à l'encodage.
    original_question: str = Field(max_length=4000)
    intent: Literal[
        "rag_general", "documents_necessaires", "estimation", "fondement_juridique"
    ]
    #: Étape du dialogue quand la question vient du CODE et non du LLM : la date d'une
    #: décision contestée se demande en deux temps (oui/non, puis la date elle-même).
    #: Bornée comme `intent`, pour la même raison — elle vient du client et pilote le
    #: comportement du nœud.
    step: Literal["date_choix", "date_valeur", "date_valeur_2"] | None = None


class ChatbotContextSchema(CamelModel):
    case_id: str | None = None
    case_status: str | None = None
    conversation_history: list[ChatMessageSchema] = Field(
        default_factory=list, max_length=HISTORIQUE_MAX
    )
    pending_clarification: PendingClarificationSchema | None = None
    #: True uniquement quand le message vient du popup de clarification (clic sur
    #: une option ou saisie dans le champ dédié). Jamais déduit du contenu du
    #: message côté backend — c'est l'UI qui sait d'où vient la réponse.
    is_clarification_reply: bool = False
    #: Date (ISO) du droit à appliquer sur la branche juridique : celle de la décision
    #: que le citoyen conteste. Absente = droit en vigueur aujourd'hui. Comme
    #: l'historique, elle fait l'aller-retour par le client (aucune session serveur).
    date_reference: str | None = None
    #: True une fois la question de date posée ET tranchée, pour ne pas la reposer à
    #: chaque question juridique de la même conversation.
    date_asked: bool = False


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
    #: État du dialogue de date, à renvoyer tel quel avec le message suivant.
    date_reference: str | None = None
    date_asked: bool = False
    #: Proposition d'action sur MonParcours, quand la réponse s'y prête. `None` sur
    #: une question de clarification (on n'interrompt pas un dialogue en cours) et
    #: sur les réponses qui n'appellent aucune suite.
    cta: ChatbotCtaSchema | None = None


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
