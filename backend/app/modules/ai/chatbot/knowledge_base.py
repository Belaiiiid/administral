"""The assistant's corpus and its retrieval step.

## What this is

Keyword retrieval over a hand-written knowledge base. It is the same *stage* a
hybrid RAG pipeline occupies — take a question, return the passages that answer
it — with a cruder matcher. Everything downstream receives the same shape, so
replacing this with vector search plus a reranker changes nothing in
``service.py``, the router, or the frontend.

## Two properties worth preserving

1. Every answer is written text paired with the source it came from. No answer
   is assembled at runtime from the citizen's own data.
2. An unmatched question yields a documented refusal, never a plausible guess.
   An assistant that fills silence with something that sounds right is worse
   than one that says it does not know: the citizen cannot tell the two apart,
   and acts on both.

Ported from ``frontend/src/features/chatbot/data/mockChatbotService.ts``; the
wording is identical so cutting over changes no answer a citizen would receive.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from app.modules.ai.chatbot.schemas import ChatbotSourceSchema, SourceCategory


@dataclass(frozen=True)
class KnowledgeEntry:
    #: Lowercase, unaccented keywords. A question matching any one of them hits.
    keywords: tuple[str, ...]
    answer: str
    sources: tuple[ChatbotSourceSchema, ...]


def normalise(text: str) -> str:
    """Accent- and case-insensitive normalisation.

    « démarche » matches « demarche ». A real pipeline normalises before
    embedding for the same reason: citizens type without accents.
    """
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn")


KNOWLEDGE_BASE: tuple[KnowledgeEntry, ...] = (
    KnowledgeEntry(
        keywords=("document", "piece", "justificatif apl", "quels documents", "fournir"),
        answer=(
            "Pour une demande APL, vous devez fournir les justificatifs liés à votre "
            "identité, votre logement et votre situation : une pièce d’identité en cours "
            "de validité, votre contrat de bail ou attestation de résidence, un relevé "
            "d’identité bancaire à votre nom, et vos justificatifs de ressources des "
            "douze derniers mois."
        ),
        sources=(
            ChatbotSourceSchema(
                title="Documents nécessaires pour une demande APL",
                category=SourceCategory.demarche,
            ),
            ChatbotSourceSchema(
                title="Liste des pièces justificatives acceptées",
                category=SourceCategory.document,
            ),
        ),
    ),
    KnowledgeEntry(
        keywords=("ressource", "revenu", "salaire", "avis d’imposition", "avis d imposition"),
        answer=(
            "Un justificatif de ressources est un document attestant des revenus que vous "
            "avez perçus sur une période donnée. Il peut s’agir de vos bulletins de "
            "salaire, de votre avis d’imposition, ou d’une attestation de versement de "
            "prestations. Il permet d’établir votre situation financière au moment de la "
            "demande."
        ),
        sources=(
            ChatbotSourceSchema(
                title="Qu’est-ce qu’un justificatif de ressources ?",
                category=SourceCategory.faq,
            ),
            ChatbotSourceSchema(
                title="Ressources prises en compte dans le calcul APL",
                category=SourceCategory.reglementation,
            ),
        ),
    ),
    KnowledgeEntry(
        keywords=("attente", "en cours", "delai", "combien de temps", "traitement", "statut"),
        answer=(
            "Un dossier reste en attente tant qu’un élément nécessaire à son instruction "
            "manque, ou tant qu’un agent ne l’a pas examiné. Les motifs les plus fréquents "
            "sont une pièce justificative absente ou illisible, et une information à "
            "confirmer auprès d’un tiers. Le détail de votre dossier indique la raison "
            "exacte et l’action éventuellement attendue de votre part."
        ),
        sources=(
            ChatbotSourceSchema(
                title="Les étapes d’instruction d’un dossier",
                category=SourceCategory.demarche,
            ),
            ChatbotSourceSchema(
                title="Pourquoi mon dossier est-il en attente ?",
                category=SourceCategory.faq,
            ),
        ),
    ),
    KnowledgeEntry(
        keywords=("apl", "aide au logement", "allocation logement"),
        answer=(
            "L’APL (aide personnalisée au logement) est une aide versée par la CAF pour "
            "réduire le montant de votre loyer ou de votre mensualité d’emprunt. Son "
            "attribution et son montant dépendent de vos ressources, de la composition de "
            "votre foyer et des caractéristiques de votre logement."
        ),
        sources=(
            ChatbotSourceSchema(
                title="Présentation de l’aide personnalisée au logement",
                category=SourceCategory.demarche,
            ),
        ),
    ),
    KnowledgeEntry(
        keywords=("bail", "logement", "loyer", "proprietaire", "colocation"),
        answer=(
            "Les informations relatives à votre logement — adresse, montant du loyer, type "
            "de bail et nature de l’occupation — sont demandées car elles conditionnent le "
            "calcul de l’aide. Elles doivent correspondre à celles figurant sur votre "
            "contrat de bail."
        ),
        sources=(
            ChatbotSourceSchema(
                title="Informations logement demandées dans le formulaire",
                category=SourceCategory.demarche,
            ),
            ChatbotSourceSchema(
                title="Conditions relatives au logement",
                category=SourceCategory.reglementation,
            ),
        ),
    ),
)


#: Offered when nothing matches. Routes to a human rather than approximating.
NO_ANSWER = (
    "Je n’ai pas d’information fiable sur ce point dans ma documentation. Pour éviter de "
    "vous induire en erreur, je préfère ne pas répondre. Vous pouvez reformuler votre "
    "question, ou contacter votre caisse pour une réponse adaptée à votre situation."
)

#: Stated *before* any general answer, so a citizen never reads a description of
#: the process and takes it for a description of their own file.
NO_CASE_CONTEXT_PREFIX = (
    "Je n’ai pas accès à un dossier en cours pour cette conversation : je ne peux donc "
    "rien vous dire de votre situation personnelle."
)

NO_CASE_CONTEXT_ANSWER = (
    f"{NO_CASE_CONTEXT_PREFIX} Vous pouvez consulter le détail de votre demande depuis "
    "votre espace, ou contacter votre caisse."
)

NO_CASE_CONTEXT_SOURCES = (
    ChatbotSourceSchema(
        title="Les étapes d’instruction d’un dossier", category=SourceCategory.demarche
    ),
)

_PERSONAL_QUESTION = re.compile(r"\bmon dossier\b|\bma demande\b|\bmon compte\b")


def is_about_their_own_case(normalised_question: str) -> bool:
    """Question worded about the citizen's own file rather than the rules."""
    return bool(_PERSONAL_QUESTION.search(normalised_question))


def retrieve(normalised_question: str) -> KnowledgeEntry | None:
    """The retrieval step. Returns the best matching passage, or None."""
    for entry in KNOWLEDGE_BASE:
        if any(normalise(keyword) in normalised_question for keyword in entry.keywords):
            return entry
    return None
