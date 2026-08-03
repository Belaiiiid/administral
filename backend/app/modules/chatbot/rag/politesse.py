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


# --- Tolérance aux fautes de frappe ------------------------------------------
#
# « marci », « banjour » : une lettre de travers, et le message partait au classifieur,
# qui n'y reconnaissait rien et répondait « Je ne peux pas répondre à cette question ».
# Sec pour le citoyen, mais surtout : chaque faute de frappe atterrissait dans
# `unanswered_log` comme une question hors-sujet. Ce journal sert à dire ce qui MANQUE au
# corpus ; le remplir de « marci » brouille le seul signal de retour du produit.
#
# La tolérance est étroite à dessein : UNE lettre d'écart, et seulement sur les mots d'au
# moins quatre lettres. « top » ou « cc » restent exacts - trop courts pour qu'une lettre
# d'écart veuille encore dire la même chose. Le vrai garde-fou reste ailleurs : un mot
# approchant ne suffit jamais, il faut que le message entier soit de la politesse.
_DISTANCE_MAX = 1
_LONGUEUR_MIN_APPROX = 4


def _a_une_faute_pres(mot: str, reference: str) -> bool:
    """Une substitution, une insertion, une suppression, ou deux lettres inversées.

    L'inversion compte pour UNE faute, alors qu'elle vaut deux substitutions : c'est la
    faute de frappe la plus courante au clavier (« bonsior », « mecri »), et deux lettres
    voisines échangées ne produisent pratiquement jamais un autre mot réel.

    Écrit à la main plutôt que via une distance complète : on n'a pas besoin de savoir de
    combien deux mots diffèrent, seulement s'ils diffèrent d'au plus une faute."""
    if mot == reference:
        return True
    court, long = sorted((mot, reference), key=len)
    if len(long) - len(court) > _DISTANCE_MAX:
        return False

    if len(court) == len(long):
        ecarts = [i for i, (a, b) in enumerate(zip(court, long)) if a != b]
        if len(ecarts) == _DISTANCE_MAX:  # une substitution
            return True
        # deux lettres voisines échangées
        return (
            len(ecarts) == 2
            and ecarts[1] == ecarts[0] + 1
            and court[ecarts[0]] == long[ecarts[1]]
            and court[ecarts[1]] == long[ecarts[0]]
        )

    # une lettre en trop : les deux mots coïncident de part et d'autre de cette lettre
    i = 0
    while i < len(court) and court[i] == long[i]:
        i += 1
    return court[i:] == long[i + 1:]


def _meme_mot(mot: str, reference: str) -> bool:
    """Égalité, ou faute de frappe d'une lettre sur un mot assez long pour le supporter."""
    if mot == reference:
        return True
    if len(mot) < _LONGUEUR_MIN_APPROX or len(reference) < _LONGUEUR_MIN_APPROX:
        return False
    return _a_une_faute_pres(mot, reference)


def _categorie(mot: str):
    """La forme de politesse que ce mot exprime, ou None si ce n'en est pas une.

    L'ordre des essais compte : un mot proche de deux vocabulaires à la fois (cas de
    figure théorique, aucun aujourd'hui) est rangé dans le plus fréquent."""
    for vocabulaire, forme in (
        (GREETING_WORDS, "salutation"),
        (THANKS_WORDS, "remerciement"),
        (FAREWELL_WORDS, "au_revoir"),
    ):
        if any(_meme_mot(mot, reference) for reference in vocabulaire):
            return forme
    return None


def _retirer_phrases_au_revoir(mots: list[str]) -> tuple[list[str], bool]:
    """Retire les suites « au revoir », « bonne journée »... et dit si on en a trouvé une."""
    restants: list[str] = []
    trouve = False
    i = 0
    while i < len(mots):
        phrase = next(
            (
                p for p in FAREWELL_PHRASES
                if len(mots) - i >= len(p)
                and all(_meme_mot(mots[i + n], attendu) for n, attendu in enumerate(p))
            ),
            None,
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
    de limite en nombre de mots : c'en était un substitut approximatif.

    Les formules sont reconnues à une faute de frappe près (« marci », « banjour ») ; les
    mots outils, non. Une faute sur « beaucoup » est plus rare qu'une faute sur le mot que
    le citoyen tape en premier, et l'élargissement se paierait en faux positifs."""
    mots = _mots(message)
    if not mots:
        return None

    mots, phrase_au_revoir = _retirer_phrases_au_revoir(mots)
    restants = [mot for mot in mots if mot not in FILLER_WORDS]
    formes = [_categorie(mot) for mot in restants]

    # Un seul mot hors politesse suffit à faire du message une vraie question.
    if any(forme is None for forme in formes):
        return None

    # Message purement poli : reste à dire de quelle politesse il s'agit. L'ordre compte
    # peu (« bonjour et merci » est l'un ou l'autre), on tranche par le plus fréquent.
    if "salutation" in formes:
        return "salutation"
    if "remerciement" in formes:
        return "remerciement"
    if phrase_au_revoir or "au_revoir" in formes:
        return "au_revoir"
    # Rien que des mots outils (« et vous ? ») : pas une politesse, pas notre affaire.
    return None


def is_greeting(message: str) -> bool:
    """Conservé pour les appelants existants : une salutation au sens strict."""
    return courtoisie(message) == "salutation"
