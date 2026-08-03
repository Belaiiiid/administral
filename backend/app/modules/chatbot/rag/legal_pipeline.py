# -*- coding: utf-8 -*-
"""Branche « fondement juridique » : répondre à partir du texte de loi, pas d'une paraphrase.

Ce que ce module apporte par rapport à `rag_pipeline.py` : les contenus CAF vulgarisés
disent « en gros, voilà comment ça marche » et ne savent pas à QUELLE DATE une règle
s'appliquait. Un citoyen qui conteste une décision de 2022 doit recevoir le droit de 2022.
Lui servir la règle d'aujourd'hui avec une source officielle affichée à côté serait pire
qu'une réponse vague : faux, et d'apparence fiable.

DEUX PORTES D'ENTRÉE VERS LE GRAPHE, dans cet ordre :

1. Le citoyen CITE un article (« ma lettre parle de l'article L. 822-2 ») — c'est certain,
   on part directement de cette référence, sans recherche.
2. Sinon, on retrouve les articles par la RECHERCHE (BM25 + Qdrant) sur le corpus
   `legislation`, indexé avec une carte d'identité citoyenne (voir
   `build_legislation_chunks.py`). C'est ce qui rend le graphe atteignable depuis
   « je loue l'appartement de mes parents » — mesuré : 9 questions sur 10 retrouvent
   leur article dans les 8 premiers résultats (`test_legislation_retrieval.py`).

Dans les deux cas, la recherche ne sert qu'à identifier QUEL article. C'est ensuite le
graphe qui donne QUELLE VERSION, avec son identifiant Légifrance : le texte servi au LLM
n'est jamais celui du chunk indexé (qui contient une reformulation non officielle destinée
à la recherche), toujours celui du graphe.

RÈGLES DE SÛRETÉ appliquées ici :
  - Aucune valeur juridique en dur : ni délai, ni seuil, ni montant, ni numéro d'article.
  - Toute réponse porte ses sources (LEGIARTI + date de version), sans exception possible :
    contrairement à `rag_general`, l'affichage n'est pas réglable sur cette branche.
  - Par défaut, le droit d'aujourd'hui. Une version antérieure n'est rendue que si une date
    est explicitement demandée (`date_reference`).
  - Aucun calcul de montant d'APL, jamais.
  - Une référence inconnue du graphe reste inconnue : on le dit, sans appeler le LLM pour
    qu'il « comble ».
"""
import threading
from datetime import date

from .legal_kg import get_kg
from .llm_client import call_llm, historique_de_confiance

# La branche juridique ratisse plus large que `rag_general` (top_k=3). Mesuré sur les
# questions de QUESTIONS_CITOYENS.md : l'article attendu est dans le top 5 six fois sur
# dix, mais dans le top 8 neuf fois sur dix. Le corpus contient beaucoup d'articles
# voisins (mêmes thèmes pour l'ALF, l'ALS, l'outre-mer, et pour d'autres prestations dans
# d'autres codes), donc le bon article est trouvé sans être premier.
TOP_K = 8

# Nombre d'articles liés (par le graphe) ajoutés au contexte, en partant du mieux classé.
# C'est ce qui permet de répondre « 2 ans » à une question sur le trop-perçu : l'article
# L821-7 renvoie au code de la sécurité sociale sans donner le délai, le lien y mène.
LIENS_MAX = 3

LEGAL_GENERATION_SYSTEM_PROMPT = """Tu expliques le droit du logement (APL) à un citoyen, à partir
d'articles de loi qui te sont fournis.

TON RÔLE : rendre le texte compréhensible SANS le déformer. C'est l'inverse d'un résumé libre :
la précision d'un texte juridique EST sa valeur. Explique en langage simple, mais ne remplace
jamais une condition par une approximation, et ne laisse pas tomber une exception parce qu'elle
complique la phrase.

RÈGLES STRICTES :
- Réponds UNIQUEMENT à partir des articles fournis ci-dessous. N'utilise jamais ce que tu sais
  par ailleurs du droit français, même si tu en es sûr.
- N'ajoute JAMAIS une règle, un délai, un seuil, un pourcentage ou un montant qui ne figure pas
  dans les textes fournis.
- Quand tu affirmes quelque chose, cite l'article ET sa date de version, comme ceci :
  « (article L822-3, version du 1er septembre 2019) ».
- La recherche est volontairement large : plusieurs articles fournis peuvent être hors sujet.
  Ignore-les silencieusement, ne les cite pas, ne dis pas qu'ils existent.
- Certains articles fournis viennent d'un AUTRE code. Quand il est indiqué qu'un article du
  logement y renvoie, ce renvoi le rend applicable : sers-t'en, c'est souvent là que se
  trouve la règle précise (un article du logement peut renvoyer ailleurs sans donner
  lui-même le délai ou le montant). En l'absence d'un tel renvoi, ne l'utilise pas.
- Un article qui ne donne aucune règle chiffrée ne doit pas t'en faire inventer une : s'il
  se contente de renvoyer à un autre texte et que ce texte ne t'est pas fourni, dis que tu
  ne peux pas donner le chiffre plutôt que d'en avancer un.
- Si les articles fournis ne permettent pas de répondre, dis-le clairement et invite le citoyen
  à se rapprocher de sa CAF. Ne comble jamais par une réponse générale.
- Ne calcule JAMAIS un montant d'aide, même approximatif, même si on insiste : les barèmes
  annuels, la zone géographique et les ressources sur douze mois glissants n'y sont pas.
  Explique les critères pris en compte et renvoie au simulateur officiel de la CAF.
- Si un article fourni est présenté comme la version applicable à une date passée, dis
  explicitement que tu réponds sur le droit applicable à cette date-là.
- N'affirme JAMAIS ce que contient le courrier du citoyen ni sur quel article l'administration
  s'est fondée : tu ne l'as pas lu. Même s'il dit avoir reçu une décision, écris « la loi
  prévoit que... » et non « la CAF a appliqué l'article X ». Se tromper sur le motif d'un
  refus enverrait le citoyen contester la mauvaise chose.

STYLE :
- Réponse directe, ton de conseiller. Pas de préambule du type « D'après les textes fournis ».
- Phrases courtes. Le vocabulaire juridique n'est employé que s'il est expliqué.
"""

from .unanswered_log import REDIRECTION_OFFICIELLE


class LegalPipeline:
    """Assemble le contexte juridique puis génère la réponse.

    Reçoit le pipeline RAG déjà construit plutôt que de rebâtir des index : les deux
    branches partagent le même BM25 et le même Qdrant, seuls les filtres de catégorie
    et les prompts diffèrent.
    """

    def __init__(self, rag_pipeline, kg=None):
        self.rag = rag_pipeline
        self.kg = kg or get_kg()

    # --- Sélection des articles ---------------------------------------------

    def articles_cites(self, message, date_reference=None):
        """Porte d'entrée n°1 : le citoyen cite lui-même des articles.

        Rend les articles trouvés et, séparément, les références que le graphe ne connaît
        pas — elles doivent être signalées au citoyen, jamais comblées."""
        articles, inconnues = [], []
        for resolue in self.kg.resoudre_lettre(message, date_decision=date_reference):
            if resolue.article:
                articles.append((resolue.article, None))
                for lie in resolue.lies[:LIENS_MAX]:
                    articles.append((lie.article, f"cité par l'article {resolue.reference}"))
            elif resolue.equivalents:
                # Ancienne numérotation (les L351-x d'avant 2019) : on remonte les articles
                # actuels correspondants plutôt que de répondre « inconnu ».
                for equivalent in resolue.equivalents[:LIENS_MAX]:
                    articles.append(
                        (equivalent, f"remplace l'ancien article {resolue.reference}")
                    )
            else:
                inconnues.append(resolue.reference)
        return articles, inconnues

    def articles_recherches(self, question, date_reference=None):
        """Porte d'entrée n°2 : retrouver les articles par le sens de la question.

        Le chunk retrouvé ne sert QU'À donner un numéro d'article : le texte servi ensuite
        vient du graphe, dans la version applicable. C'est ce qui garantit qu'une carte
        d'identité citoyenne (générée, non officielle) ne peut jamais devenir une réponse.

        UN ARTICLE VENU D'UN AUTRE CODE N'EST JAMAIS UN POINT D'ENTRÉE. Le corpus contient
        des articles ramenés par les liens depuis 19 autres codes (`hors_perimetre`), qui
        traitent les mêmes thèmes pour d'AUTRES prestations : la prescription des trop-perçus
        de vieillesse et d'invalidité (L355-3) ou du RSA (L262-45) ressort ainsi en tête sur
        une question de trop-perçu d'APL. Répondre avec eux, c'est appliquer au logement une
        règle écrite pour autre chose. Ils ne sont donc admis que s'ils sont ATTEINTS PAR UN
        LIEN depuis un article du périmètre APL — c'est ce chemin qui prouve leur pertinence,
        et c'est exactement ce qui fait remonter L553-1 (délai de 2 ans) depuis L821-7.
        """
        resultats = self.rag.retrieve(question, top_k=TOP_K, category=["legislation"])

        articles, vus = [], set()
        for chunk, _score in resultats:
            num = chunk.get("article_num")
            if not num or num in vus:
                continue
            article = self.kg.get_article(num, date_reference=date_reference)
            if article is None:
                continue  # pas de version applicable à cette date : on n'invente pas
            if article.hors_perimetre:
                continue  # autre code : admis seulement par lien, voir ci-dessous
            vus.add(num)
            articles.append((article, None))

        # Les mieux classés entraînent leurs voisins immédiats : un article renvoie souvent
        # ailleurs sans donner la règle (L821-7 -> L553-1 pour le délai de prescription).
        # On part de plusieurs têtes, pas d'une seule : le bon article n'est premier qu'une
        # fois sur trois (voir test_legislation_retrieval.py).
        for tete, _provenance in list(articles[:3]):
            for lie in self.kg.expand(tete.num, hops=1, date_reference=date_reference,
                                      code=tete.code)[:LIENS_MAX]:
                if lie.article.num not in vus:
                    vus.add(lie.article.num)
                    articles.append((lie.article, f"cité par l'article {tete.num}"))

        return articles

    # --- Génération ----------------------------------------------------------

    def _contexte(self, articles):
        blocs = []
        for i, (article, provenance) in enumerate(articles, 1):
            entete = f"[Article {i}] {article.num} — version en vigueur depuis le {article.source.date_debut}"
            if provenance:
                entete += f" ({provenance})"
            lignes = [entete, f"Source : {article.source.id_legiarti}"]
            if article.hors_perimetre:
                # Nuance essentielle : un article d'un autre code n'est PAS suspect en soi.
                # Il est ici parce qu'un article du logement y renvoie explicitement, et ce
                # renvoi est ce qui le rend applicable - c'est même le seul chemin vers la
                # règle dans certains cas (le délai de prescription vit dans le code de la
                # sécurité sociale, pas dans celui du logement). Le dire positivement, sinon
                # le modèle écarte la bonne réponse et comble avec sa mémoire.
                if provenance:
                    lignes.append(
                        "Cet article appartient à un autre code, mais l'article du logement "
                        "indiqué ci-dessus y renvoie : ce renvoi le rend applicable ici."
                    )
                else:
                    lignes.append(
                        "ATTENTION : cet article vient d'un AUTRE code que celui du logement, "
                        "sans renvoi établi. Ne l'utilise que si son texte vise explicitement "
                        "l'aide au logement."
                    )
            if article.chemin:
                lignes.append(f"Plan : {' > '.join(article.chemin)}")
            lignes.append(article.texte.strip())
            blocs.append("\n".join(lignes))
        return "\n\n".join(blocs)

    def _sources(self, articles, texte_reponse=None):
        """Citations structurées, dédoublonnées, dans l'ordre de présentation.

        Restreintes aux articles RÉELLEMENT CITÉS dans la réponse quand c'est détectable :
        la recherche fournit volontairement une dizaine d'articles au modèle, dont plusieurs
        hors sujet. Les lister tous en « Sources » ferait passer pour des fondements des
        textes que la réponse n'utilise pas — un citoyen qui vérifie y perdrait confiance,
        et c'est le contraire du but d'une citation. La détection réutilise l'extracteur de
        références du graphe, appliqué cette fois à la réponse générée.
        """
        cites = set(self.kg.extract_references(texte_reponse)) if texte_reponse else set()

        sources, vus = [], set()
        for article, _provenance in articles:
            if article.num in vus:
                continue
            # Si le modèle n'a cité aucun article (il doit le faire, mais on ne s'en remet
            # pas à lui), on retombe sur la liste complète : mieux vaut trop de sources que
            # pas de source du tout.
            if cites and article.num not in cites:
                continue
            vus.add(article.num)
            sources.append({
                "num": article.num,
                "legiarti": article.source.id_legiarti,
                "date_debut": article.source.date_debut.isoformat() if article.source.date_debut else None,
                "url": f"https://www.legifrance.gouv.fr/codes/article_lc/{article.source.id_legiarti}",
                "titre": f"Article {article.num}",
                "category": "legislation",
            })
        return sources

    def generate_answer(self, question, articles, inconnues=None, date_reference=None,
                        conversation_history=None, model="mistral-small-latest"):
        consigne_date = (
            f"Le citoyen interroge le droit applicable au {date_reference.isoformat()} : les articles "
            f"ci-dessous sont fournis dans leur version applicable à CETTE date. Dis-le dans ta réponse."
            if date_reference else
            "Les articles ci-dessous sont fournis dans leur version en vigueur aujourd'hui."
        )
        user_prompt = (
            f"{consigne_date}\n\n"
            f"Articles disponibles :\n\n{self._contexte(articles)}\n\n"
            f"Question du citoyen : {question}"
        )

        messages = [{"role": "system", "content": LEGAL_GENERATION_SYSTEM_PROMPT}]
        messages.extend(historique_de_confiance(conversation_history))
        messages.append({"role": "user", "content": user_prompt})

        return call_llm(messages=messages, model=model, temperature=0.2)

    # --- Point d'entrée ------------------------------------------------------

    def answer(self, question, date_reference=None, conversation_history=None):
        """Retourne {"text", "sources_texte", "sources", "articles", "references_inconnues",
        "answered"}.

        `text` est la réponse seule ; `sources_texte` est la ligne de citations à ajouter.
        Les deux sont rendus séparément parce que les consommateurs diffèrent : un chat en
        mode texte colle la ligne à la suite, une interface web affiche les mêmes sources en
        liens cliquables à côté de la bulle. Ce qui n'est PAS optionnel sur cette branche,
        c'est de les montrer d'une manière ou d'une autre (contrairement à `SHOW_SOURCES`
        côté rag_general)."""
        articles, inconnues = self.articles_cites(question, date_reference=date_reference)
        if not articles:
            articles = self.articles_recherches(question, date_reference=date_reference)

        if not articles:
            # Aucun texte : on ne sollicite même pas le LLM. Rien à reformuler, et un
            # contexte vide est exactement la situation où un modèle comble avec sa mémoire.
            # `answered=False` remonte au nœud, qui consigne la question (unanswered_log).
            texte = REDIRECTION_OFFICIELLE
            if inconnues:
                texte += (
                    f"\n\nLes références que vous citez ({', '.join(inconnues)}) ne figurent pas "
                    "dans ma base : je ne peux pas vous dire ce qu'elles contiennent."
                )
            return {"text": texte, "sources_texte": "", "sources": [], "articles": [],
                    "references_inconnues": inconnues, "answered": False}

        texte = self.generate_answer(
            question, articles, inconnues=inconnues,
            date_reference=date_reference, conversation_history=conversation_history,
        )

        if inconnues:
            texte += (
                f"\n\nEn revanche, je ne trouve pas dans ma base les références suivantes que vous "
                f"citez : {', '.join(inconnues)}. Je préfère ne rien affirmer à leur sujet."
            )

        sources = self._sources(articles, texte_reponse=texte)
        sources_texte = "\n\nSources : " + " ; ".join(
            f"article {s['num']} (version du {s['date_debut']}, {s['legiarti']})" for s in sources
        )
        return {
            "text": texte,
            "sources_texte": sources_texte,
            "sources": sources,
            "articles": [a.num for a, _ in articles],
            "references_inconnues": inconnues,
            "answered": True,
        }


_legal_pipeline_instance = None
#: Voir `orchestrator.get_rag_pipeline` : endpoint synchrone, pool de threads, donc
#: construction concurrente possible. Ici le coût d'une double construction serait
#: surtout un second chargement du graphe juridique en mémoire.
_legal_pipeline_lock = threading.Lock()


def get_legal_pipeline(rag_pipeline):
    """Singleton, construit à partir du pipeline RAG déjà chargé (index partagés).

    Seul cache de cet objet dans le projet : l'orchestrateur en tenait un second, qui
    ne servait qu'à mémoriser ce que celui-ci mémorisait déjà."""
    global _legal_pipeline_instance
    if _legal_pipeline_instance is None:
        with _legal_pipeline_lock:
            if _legal_pipeline_instance is None:
                _legal_pipeline_instance = LegalPipeline(rag_pipeline)
    return _legal_pipeline_instance


if __name__ == "__main__":
    import io
    import sys

    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

    from .rag_pipeline import RagPipeline

    pipeline = get_legal_pipeline(RagPipeline())
    question = "Je loue l'appartement de mes parents, est-ce que j'ai droit à l'APL ?"
    resultat = pipeline.answer(question)
    print(f"Question : {question}\n")
    print(resultat["text"])
    print(f"\nArticles mobilisés : {resultat['articles']}")
