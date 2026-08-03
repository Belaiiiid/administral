"""Accès au knowledge graph juridique — chargement unique, en mémoire.

Le graphe (Code de la construction et de l'habitation, Livre VIII, plus les articles
d'autres codes atteints par les liens) est un fichier de 0,6 Mo lu une seule fois au
démarrage, comme les index BM25/Qdrant. Aucune base de données, aucun réseau, aucun
appel LLM : c'est une consultation de données.

Ce module ne fait QUE le chargement et la résolution du chemin. La branche juridique
elle-même (retrieval, prompt, génération) vit dans `legal_pipeline.py` - même
séparation qu'entre `bm25_index.py`/`qdrant_index.py` et `rag_pipeline.py`.

Le chemin du fichier est résolu par `__file__` plutôt que relatif au répertoire courant :
c'est ce qui permet de re-porter le tout tel quel chez MonParcours, où le processus
démarre depuis `backend/` (même raison que dans `bm25_index.py`).
"""
import os
import time

from app.core.logger import logger
from .kg_apl.kg_local import KgLocal

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KG_FILE = os.path.join(_BASE_DIR, "data", "kg", "kg_apl.json.gz")

_kg_instance = None


def get_kg():
    """Singleton paresseux : le graphe est chargé à la première utilisation, puis gardé.

    ~1 s de chargement. Comme pour `get_rag_pipeline()`, l'appelant a intérêt à
    l'initialiser au démarrage plutôt que de payer ce coût pendant la première
    question d'un citoyen (voir décision 9 du CLAUDE.md)."""
    global _kg_instance
    if _kg_instance is None:
        debut = time.perf_counter()
        _kg_instance = KgLocal(KG_FILE)
        meta = _kg_instance.meta
        # Les compteurs sont la seule façon de voir qu'un graphe s'est appauvri : un
        # fichier tronqué se charge sans erreur et ne se remarque qu'aux réponses.
        logger.info(
            "chatbot: knowledge graph juridique chargé",
            {
                "articles": meta["nb_articles"],
                "articles_avec_texte": meta["nb_articles_avec_texte"],
                "versions": meta["nb_versions"],
                "liens": meta["nb_liens"],
                "duree_ms": round((time.perf_counter() - debut) * 1000),
            },
        )
    return _kg_instance


if __name__ == "__main__":
    kg = get_kg()
    article = kg.get_article("L822-3")
    print(f"{article.num} ({article.source.id_legiarti}, version du {article.source.date_debut})")
    print(" ".join(article.texte.split())[:200], "...")
