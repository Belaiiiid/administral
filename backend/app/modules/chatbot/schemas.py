"""Wire contract for the citizen assistant.

Le contrat de base est inchangé (mêmes champs, même camelCase) : le frontend
existant continue de fonctionner. Ce qui s'ajoute vient de la clarification
structurée du moteur migré (popup à choix, cf. décisions 7 et 14 du CLAUDE.md
d'`apl_rag`) :

- réponse : `options` (les choix à afficher) et `pendingClarification` (à quoi la
  prochaine réponse se rattache) ;
- requête : `clarificationReply` — **injecté par l'UI, jamais déduit du texte** —
  qui dit COMMENT le message a été produit (clic sur un choix, ou saisie pendant
  qu'une question était posée), et `pendingClarification` renvoyé tel quel.

Ce champ portait auparavant un booléen, donc un verdict : « ceci est une réponse ».
L'UI ne peut pas le rendre — elle ne connaît pas le vocabulaire des questions. Elle
rapporte maintenant un fait observable, et le serveur décide. La frontière est la
même que partout ailleurs ici.

Le backend ne garde aucune session : comme `conversationHistory`, l'état de
clarification fait l'aller-retour par le client. C'est ce qui permet au même
moteur de servir le portail web et un canal sans session (WhatsApp).
"""

from __future__ import annotations

import enum
from datetime import date, datetime
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
#: Plancher de plausibilité pour la date d'une décision reçue. Doit rester aligné sur
#: `orchestrator.parse_date_fr`, qui applique la même borne au texte écrit par le citoyen.
DATE_DECISION_MIN = date(1990, 1, 1)


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
    #: décision contestée se demande en deux temps (oui/non, puis la date elle-même),
    #: et le profil déjà enregistré d'un citoyen connecté se fait confirmer avant d'être
    #: utilisé (`profil_confirmation`, voir `orchestrator.documents_necessaires_node`).
    #: Bornée comme `intent`, pour la même raison — elle vient du client et pilote le
    #: comportement du nœud.
    step: Literal[
        "date_choix", "date_valeur", "date_valeur_2", "profil_confirmation"
    ] | None = None


class ChatbotContextSchema(CamelModel):
    case_id: str | None = None
    case_status: str | None = None
    conversation_history: list[ChatMessageSchema] = Field(
        default_factory=list, max_length=HISTORIQUE_MAX
    )
    pending_clarification: PendingClarificationSchema | None = None
    #: COMMENT le message a été produit, quand une clarification était en attente.
    #: `None` = aucune clarification en cours (message spontané).
    #:
    #: Remplace un booléen « est-ce une réponse ? ». La nuance décide de tout : ce
    #: booléen demandait à l'UI un JUGEMENT qu'elle ne peut pas rendre. Ne disposant que
    #: d'un indice — des boutons sont-ils affichés ? — elle concluait que tout texte tapé
    #: était un changement de sujet. Une réponse écrite ou DICTÉE (« je suis locataire »)
    #: n'atteignait donc jamais `profilage_documents.reconnaitre`, pourtant écrit pour
    #: elle ; pire, elle repartait au classifieur, et si celui-ci tombait ailleurs
    #: l'entretien en cours était effacé.
    #:
    #: L'UI ne rapporte donc plus qu'un FAIT dont elle est seule témoin — un clic ou une
    #: saisie — et le backend tranche, lui seul disposant du vocabulaire de chaque
    #: question. Le partage est le même que pour le reste du contrat : au client ce qu'il
    #: observe, au serveur ce qu'il décide.
    clarification_reply: Literal["option", "text"] | None = None
    #: Date du droit à appliquer sur la branche juridique : celle de la décision que le
    #: citoyen conteste. Absente = droit en vigueur aujourd'hui. Comme l'historique, elle
    #: fait l'aller-retour par le client (aucune session serveur).
    #:
    #: TYPÉE, et non plus une chaîne libre. C'est le champ du contrat qui mérite la
    #: validation la plus stricte : il décide de QUELLE VERSION de la loi le citoyen se
    #: voit appliquer. En chaîne libre, une valeur non ISO partait jusqu'à
    #: `date.fromisoformat`, y levait, et ressortait en 200 OK « l'assistant est
    #: momentanément indisponible » — pour ce qui est une requête invalide, donc un 422.
    #:
    #: Cela ferme aussi un contournement : `parse_date_fr` refuse le futur et l'avant-1990
    #: quand le citoyen ÉCRIT une date, mais un client qui renseignait ce champ
    #: directement échappait entièrement à ce contrôle.
    date_reference: date | None = None

    @field_validator("date_reference")
    @classmethod
    def _date_plausible(cls, valeur: date | None) -> date | None:
        """Mêmes bornes que `orchestrator.parse_date_fr` : une décision reçue ne peut
        être ni à venir, ni antérieure à 1990.

        Les bornes sont écrites ici ET là-bas, à dessein : le moteur ne doit pas dépendre
        de la couche API (il sert aussi un canal sans HTTP). Le jour où `parse_date_fr`
        sortira dans son propre module feuille — c'est au programme (M1) — les deux
        pourront partager la même constante."""
        if valeur is None:
            return None
        if valeur > date.today():
            raise ValueError("une décision déjà reçue ne peut pas porter une date future")
        if valeur < DATE_DECISION_MIN:
            raise ValueError(f"date antérieure à {DATE_DECISION_MIN.year}, invraisemblable")
        return valeur
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
    #: État du dialogue de date, à renvoyer tel quel avec le message suivant. Non validée
    #: ici : elle sort du moteur, qui la produit via `parse_date_fr` — déjà bornée. La
    #: revalider ferait d'une anomalie interne un 500 au lieu d'une réponse.
    date_reference: date | None = None
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
