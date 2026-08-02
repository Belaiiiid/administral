"""Reconnaître un message qui n'est QUE de la politesse.

Sorti de `orchestrator.py` pour une raison précise : c'est une fonction de texte
pure, sans LLM, sans index, sans réseau — mais elle vivait dans un module qui
importe LangGraph, Qdrant et sentence-transformers. La tester coûtait donc une
trentaine de secondes de chargement de modèles pour vérifier des règles sur des
chaînes de caractères. Ici, l'import ne coûte rien, et la règle se teste au coup
par coup (`tests/test_chatbot_courtoisie.py`).

CE QUI SE JOUE ICI. Une politesse est traitée sans appeler le classifieur : très
fréquente en ouverture comme en clôture, jamais ambiguë, et très mal servie par
le message hors-sujet — répondre « je ne peux vous aider que sur l'APL » à
quelqu'un qui dit « merci » est brutal et donne l'impression d'un robot qui
n'écoute pas.

Mais l'erreur inverse coûte bien plus cher : un message pris à tort pour une
politesse part au nœud `fallback`, qui répond « je vous en prie » et s'arrête —
sans classifieur, et sans même consigner la question (`unanswered_log` ignore
volontairement les politesses). La question du citoyen disparaît, et l'équipe
n'en garde aucune trace. D'où la règle appliquée ici, et sa formulation exacte :
non pas « ce message contient-il un mot de politesse ? », mais « ce message
n'est-il QUE de la politesse ? ».
"""

from __future__ import annotations

import re
import unicodedata

GREETING_WORDS = {
    "bonjour", "bonsoir", "salut", "coucou", "hello", "hi", "hey",
    "bjr", "slt", "yo",
}
THANKS_WORDS = {
    "merci", "mercii", "mrc", "thanks", "thx", "nickel", "parfait", "super", "genial",
    "top", "impeccable",
}
#: Mots d'au revoir sans équivalent ordinaire : ils ne peuvent rien vouloir dire d'autre.
#: « bonne », « journée » et « revoir » n'y figurent PAS - seuls, ce sont des mots courants
#: (« bonne foi », « la journée de carence ») ; ils ne comptent qu'en phrase, ci-dessous.
FAREWELL_WORDS = {"bye", "ciao", "adieu"}

#: Les formules d'au revoir sont reconnues comme SUITES de mots, pas mot à mot. C'est la
#: seule façon de distinguer « bonne journée » de « bonne foi ou pas ? ».
FAREWELL_PHRASES = (
    ("au", "revoir"),
    ("bonne", "journee"),
    ("bonne", "soiree"),
    ("bonne", "fin", "de", "journee"),
    ("bonne", "continuation"),
    ("a", "bientot"),
    ("a", "plus"),
)

#: Mots vides tolérés AUTOUR d'une formule : « merci beaucoup », « bonjour à vous ».
#: Volontairement limité à des mots outils - jamais un mot qui porte du sens, sinon
#: « merci pour le dossier » redeviendrait un simple remerciement.
FILLER_WORDS = {
    "a", "au", "aux", "de", "du", "des", "le", "la", "les", "l", "d", "et", "en",
    "je", "j", "me", "moi", "mon", "ma", "mes", "vous", "votre", "vos", "tu", "toi",
    "beaucoup", "bien", "tres", "tout", "tous", "encore", "deja", "aussi",
    "monsieur", "madame", "mme", "mr", "m",
}


def _mots(message: str) -> list[str]:
    """Mots du message, accents retirés, chiffres compris.

    Les accents sont normalisés pour que « bonne journée » et « bonne journee » soient le
    même geste. Les chiffres sont conservés exprès : ils font partie du message et doivent
    empêcher de le prendre pour une simple politesse (« bonjour 3230 » est une question)."""
    plat = unicodedata.normalize("NFD", message.lower())
    plat = "".join(c for c in plat if unicodedata.category(c) != "Mn")
    return re.findall(r"[a-z0-9]+", plat)


def _retirer_phrases_au_revoir(mots: list[str]) -> tuple[list[str], bool]:
    """Retire les suites « au revoir », « bonne journée »... et dit si on en a trouvé une."""
    restants: list[str] = []
    trouve = False
    i = 0
    while i < len(mots):
        phrase = next(
            (p for p in FAREWELL_PHRASES if tuple(mots[i:i + len(p)]) == p), None
        )
        if phrase:
            trouve = True
            i += len(phrase)
        else:
            restants.append(mots[i])
            i += 1
    return restants, trouve


def courtoisie(message: str):
    """Rend "salutation", "remerciement", "au_revoir", ou None.

    La question posée n'est PAS « ce message contient-il un mot de politesse ? » mais
    « ce message n'est-il QUE de la politesse ? ». C'est toute la différence : « Bonjour,
    quels documents ? » contient une salutation et reste une question, qui doit partir au
    classifieur.

    On retire donc les formules et les mots outils qui les entourent : s'il reste le
    moindre mot porteur de sens, ce n'est pas de la politesse. Il n'y a volontairement pas
    de limite en nombre de mots : c'en était un substitut approximatif."""
    mots = _mots(message)
    if not mots:
        return None

    mots, phrase_au_revoir = _retirer_phrases_au_revoir(mots)
    restants = [mot for mot in mots if mot not in FILLER_WORDS]

    # Un seul mot hors politesse suffit à faire du message une vraie question.
    if any(
        mot not in GREETING_WORDS and mot not in THANKS_WORDS and mot not in FAREWELL_WORDS
        for mot in restants
    ):
        return None

    # Message purement poli : reste à dire de quelle politesse il s'agit. L'ordre compte
    # peu (« bonjour et merci » est l'un ou l'autre), on tranche par le plus fréquent.
    if any(mot in GREETING_WORDS for mot in restants):
        return "salutation"
    if any(mot in THANKS_WORDS for mot in restants):
        return "remerciement"
    if phrase_au_revoir or any(mot in FAREWELL_WORDS for mot in restants):
        return "au_revoir"
    # Rien que des mots outils (« et vous ? ») : pas une politesse, pas notre affaire.
    return None


def is_greeting(message: str) -> bool:
    """Conservé pour les appelants existants : une salutation au sens strict."""
    return courtoisie(message) == "salutation"
