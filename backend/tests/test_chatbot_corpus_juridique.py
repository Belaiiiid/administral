"""Le corpus juridique n'est atteignable que par le chemin qui sait le dater.

La branche `fondement_juridique` existe pour une raison précise : la loi change,
et un citoyen qui conteste une décision de 2022 doit recevoir le droit de 2022.
Elle ne sert donc jamais le texte du chunk indexé — elle s'en sert seulement pour
identifier QUEL article, puis va chercher la bonne VERSION dans le graphe, avec sa
date et son identifiant Légifrance.

Or le corpus `legislation` était aussi ouvert à `rag_general` pour le rôle agent.
Les chunks y contiennent du texte d'article figé à une version indexée. Un agent
dont la question tombait sur `rag_general` plutôt que sur `fondement_juridique`
— un aléa de classification, rien d'autre — recevait donc du droit potentiellement
périmé, sans date, généré par un prompt qui ignore tout de la datation. Toute la
garantie de la branche juridique était contournée par un tirage au sort.

Ces tests fixent la frontière : cette catégorie n'entre pas dans `rag_general`,
et elle reste accessible là où elle doit l'être.
"""

from __future__ import annotations

import glob
import json
import os

import pytest

from app.modules.chatbot.rag import orchestrator

CHUNKS_DIR = os.path.join(
    os.path.dirname(orchestrator.__file__), "data", "chunks"
)


def _categories_du_corpus() -> dict[str, int]:
    compte: dict[str, int] = {}
    for chemin in glob.glob(os.path.join(CHUNKS_DIR, "chunks_*.json")):
        with open(chemin, encoding="utf-8") as f:
            for chunk in json.load(f):
                categorie = chunk.get("category")
                compte[categorie] = compte.get(categorie, 0) + 1
    return compte


@pytest.mark.parametrize("role", list(orchestrator.CATEGORIES_BY_ROLE))
def test_aucun_role_natteint_le_corpus_juridique_par_rag_general(role):
    """Le cœur du correctif : ni citoyen ni agent."""
    assert "legislation" not in orchestrator.CATEGORIES_BY_ROLE[role]


def test_un_role_inconnu_retombe_sur_le_corpus_le_plus_etroit():
    """`user_role` vient de l'appelant : une valeur inattendue ne doit rien ouvrir."""
    categories = orchestrator.CATEGORIES_BY_ROLE.get(
        "administrateur_supreme", orchestrator.CATEGORIES_BY_ROLE["citizen"]
    )
    assert categories == ["demarche"]


def test_la_branche_juridique_demande_le_corpus_explicitement():
    """Elle ne passe pas par `CATEGORIES_BY_ROLE` : c'est ce qui permet de fermer cette
    table sans lui retirer son corpus."""
    from app.modules.chatbot.rag import legal_pipeline

    source = __import__("inspect").getsource(legal_pipeline.LegalPipeline.articles_recherches)
    assert 'category=["legislation"]' in source


def test_le_corpus_juridique_est_bien_alimente():
    """Le commentaire du contrat a longtemps dit « pas encore alimenté ». C'est ce
    décalage qui a masqué le contournement : si le corpus se vide un jour, que ce soit
    ce test qui le dise, et non une réponse juridique silencieusement absente."""
    categories = _categories_du_corpus()
    assert categories.get("legislation", 0) > 0
    assert categories.get("demarche", 0) > 0


def test_le_corpus_citoyen_ne_contient_que_des_demarches():
    """Ce que `rag_general` peut réellement servir à un citoyen."""
    autorisees = set(orchestrator.CATEGORIES_BY_ROLE["citizen"])
    assert autorisees == {"demarche"}
    assert "legislation" not in autorisees
