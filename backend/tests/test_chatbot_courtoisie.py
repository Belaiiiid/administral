"""La détection de politesse de l'assistant citoyen (`rag.politesse`).

Pourquoi ces tests existent : un faux positif ici ne dégrade pas la réponse, il
SUPPRIME la question. Un message reconnu comme une politesse part au nœud
`fallback`, qui répond « je vous en prie » et s'arrête là — sans passer par le
classifieur, et sans même consigner la question dans `unanswered_log` (le
journal ignore volontairement les politesses). Le citoyen voit donc sa question
disparaître, et l'équipe n'en garde aucune trace.

D'où la règle testée ici : la question n'est pas « ce message contient-il un mot
de politesse ? » mais « ce message n'est-il QUE de la politesse ? ». Les cas
d'ouverture mixtes (« Bonjour, quels documents ? ») sont la forme la plus
courante d'un premier message en français : ils doivent traverser.

L'import vise `rag.politesse` et NON `rag.orchestrator` : le second tire
LangGraph, Qdrant et sentence-transformers, soit une trentaine de secondes de
chargement pour vérifier des règles sur des chaînes de caractères. C'est la
raison d'être du module séparé — si cet import revient un jour à
l'orchestrateur, la suite redevient lente sans que rien ne le signale.
"""

from __future__ import annotations

import pytest

from app.modules.chatbot.rag.politesse import courtoisie, is_greeting


#: Politesses pures : rien d'autre que la formule et les mots outils qui l'entourent.
POLITESSES = [
    ("bonjour", "salutation"),
    ("Bonjour !", "salutation"),
    ("bjr", "salutation"),
    ("Bonjour à vous", "salutation"),
    ("Salut", "salutation"),
    ("merci", "remerciement"),
    ("Merci beaucoup", "remerciement"),
    ("Merci beaucoup madame", "remerciement"),
    ("super", "remerciement"),
    ("parfait, merci", "remerciement"),
    ("au revoir", "au_revoir"),
    ("Bonne journée", "au_revoir"),
    ("bonne soirée !", "au_revoir"),
    ("à bientôt", "au_revoir"),
    ("bye", "au_revoir"),
]

#: Les régressions que ce correctif visait : chacune de ces lignes était classée
#: comme une politesse, donc jetée sans réponse et sans trace.
QUESTIONS_JADIS_JETEES = [
    "Bonjour quels documents ?",
    "Bonjour, je veux l'APL",
    "super, et le RIB ?",
    "Bonne foi ou pas ?",
    "cc mon dossier APL",
]

#: Vraies questions contenant un mot proche d'une formule : elles doivent traverser.
QUESTIONS = [
    "merci de me dire quels documents fournir",
    "Quels documents pour l'APL ?",
    "salut, comment ça marche ?",
    "la journée de carence est-elle prise en compte ?",
    "top départ pour ma demande, je fais quoi ?",
    "j'ai reçu un refus, est-ce légal ?",
]


@pytest.mark.parametrize(("message", "forme"), POLITESSES)
def test_politesse_pure_est_reconnue(message: str, forme: str) -> None:
    assert courtoisie(message) == forme


@pytest.mark.parametrize("message", QUESTIONS_JADIS_JETEES)
def test_politesse_suivie_dune_question_reste_une_question(message: str) -> None:
    """Le mot de politesse est ignoré, la question part au classifieur."""
    assert courtoisie(message) is None


@pytest.mark.parametrize("message", QUESTIONS)
def test_question_contenant_un_mot_proche_reste_une_question(message: str) -> None:
    assert courtoisie(message) is None


def test_accents_absents_ou_presents_donnent_le_meme_resultat() -> None:
    """Un citoyen qui tape sans accents fait le même geste."""
    assert courtoisie("bonne journee") == courtoisie("bonne journée") == "au_revoir"


def test_les_chiffres_comptent_comme_du_sens() -> None:
    """« bonjour 3230 » (le numéro de la CAF) est un message, pas une salutation."""
    assert courtoisie("bonjour 3230") is None


def test_message_vide_ou_sans_mot() -> None:
    assert courtoisie("") is None
    assert courtoisie("   ") is None
    assert courtoisie("?!") is None


def test_mots_outils_seuls_ne_sont_pas_une_politesse() -> None:
    assert courtoisie("et vous ?") is None


def test_is_greeting_reste_aligne() -> None:
    """L'ancien point d'entrée continue de dire la même chose que `courtoisie`."""
    assert is_greeting("bonjour") is True
    assert is_greeting("merci") is False
    assert is_greeting("Bonjour quels documents ?") is False
