"""La couche sémantique arrive parfois après le démarrage. Elle doit être servie.

CE QUI ÉTAIT CASSÉ, observé en production sur la machine de dev. Le démarrage
attendait la construction sémantique 25 s puis, si elle n'avait pas abouti,
l'ABANDONNAIT — le thread continuait pourtant, finissait son travail, et son
résultat était jeté. Le process restait en BM25 seul pour toute sa vie.

Ce n'était pas un cas limite. Sous Windows, le seul `import sentence_transformers`
(torch et ses milliers de fichiers) prend une vingtaine de secondes, suivi de 13 s
pour construire le modèle : le délai était dépassé à CHAQUE démarrage, modèle déjà
en cache et embeddings déjà générés. La moitié sémantique de la recherche hybride
n'était donc jamais servie, et rien ne le disait — `mode_recherche` rapportait
« bm25_seul », ce qui était exact et passait pour un choix.

Ces tests fixent le sens du délai : il borne CE QUE LE DÉMARRAGE ATTEND, pas ce
que le pipeline finira par offrir.

Aucun modèle n'est chargé ici : `build_index` des deux index est remplacé par un
double, ce qui rend la construction instantanée et le test hermétique.
"""

from __future__ import annotations

import threading
import time

import pytest

from app.modules.chatbot.rag import rag_pipeline


class FauxBm25:
    """Le double du sac de mots : `retrieve` doit toujours pouvoir répondre sans
    la couche sémantique, c'est toute la raison d'être du mode dégradé."""


CHUNKS = [{"chunk_id": "c1", "text": "APL", "category": "demarche"}]


@pytest.fixture(autouse=True)
def _bm25_instantane(monkeypatch):
    monkeypatch.setattr(rag_pipeline.bm25_index, "build_index", lambda: (FauxBm25(), CHUNKS))


@pytest.fixture
def _delai_court(monkeypatch):
    """Le délai de démarrage réel est en dizaines de secondes ; ici, un battement.

    Ce qu'on teste n'est pas sa valeur mais sa SIGNIFICATION, et elle est la même
    à 50 ms qu'à 25 s."""
    monkeypatch.setattr(rag_pipeline, "_SEMANTIC_TIMEOUT_S", 0.05)


def _construction_lente(duree_s: float, client="qdrant", modele="embeddings"):
    """Un `qdrant_index.build_index` qui met `duree_s` à rendre son résultat."""

    def build_index():
        time.sleep(duree_s)
        return client, modele

    return build_index


def test_une_construction_plus_lente_que_le_delai_ne_bloque_pas_le_demarrage(
    monkeypatch, _delai_court
):
    """Le démarrage rend la main au délai, en BM25 seul — il n'attend pas la fin."""
    monkeypatch.setattr(rag_pipeline.qdrant_index, "build_index", _construction_lente(1.0))

    debut = time.perf_counter()
    pipeline = rag_pipeline.RagPipeline()
    duree = time.perf_counter() - debut

    assert pipeline.semantic_available is False
    assert duree < 0.9, "le démarrage a attendu la construction au lieu de dégrader"


def test_le_pipeline_bascule_en_hybride_quand_la_construction_aboutit_enfin(
    monkeypatch, _delai_court
):
    """LE TEST DE NON-RÉGRESSION. Le travail terminé après le délai était jeté ;
    il doit maintenant être adopté, sans redémarrage."""
    monkeypatch.setattr(rag_pipeline.qdrant_index, "build_index", _construction_lente(0.2))

    pipeline = rag_pipeline.RagPipeline()
    assert pipeline.semantic_available is False  # au démarrage, la couche manque

    _attendre(lambda: pipeline.semantic_available, "la bascule en hybride n'a pas eu lieu")
    assert pipeline.qdrant_client == "qdrant"
    assert pipeline.embedding_model == "embeddings"


def test_le_drapeau_nest_leve_quapres_le_client_et_le_modele(monkeypatch, _delai_court):
    """Publication en dernier : jamais « hybride » avec un client encore vide.

    Le pipeline est lu par un pool de threads pendant que la construction publie.
    Un lecteur qui voit le drapeau doit donc trouver les deux objets en place —
    sinon un tour partirait en recherche sémantique sur un `None`."""
    monkeypatch.setattr(rag_pipeline.qdrant_index, "build_index", _construction_lente(0.2))

    pipeline = rag_pipeline.RagPipeline()

    incoherences = []
    arret = threading.Event()

    def surveiller():
        while not arret.is_set():
            if pipeline.semantic_available and (
                pipeline.qdrant_client is None or pipeline.embedding_model is None
            ):
                incoherences.append("drapeau levé avant le client ou le modèle")
                return

    veilleur = threading.Thread(target=surveiller, daemon=True)
    veilleur.start()
    _attendre(lambda: pipeline.semantic_available, "la bascule en hybride n'a pas eu lieu")
    arret.set()
    veilleur.join(timeout=1)

    assert not incoherences


def test_une_construction_qui_echoue_laisse_le_pipeline_en_bm25(monkeypatch, _delai_court):
    """Une panne (pas de réseau, librairie incompatible) dégrade, ne casse pas."""

    def build_index():
        raise RuntimeError("modèle d'embeddings introuvable")

    monkeypatch.setattr(rag_pipeline.qdrant_index, "build_index", build_index)

    pipeline = rag_pipeline.RagPipeline()

    time.sleep(0.1)  # laisser au thread le temps d'échouer, s'il devait le faire tard
    assert pipeline.semantic_available is False
    assert pipeline.qdrant_client is None


def test_la_recherche_reste_lexicale_tant_que_la_couche_nest_pas_publiee(
    monkeypatch, _delai_court
):
    """`retrieve` relit le drapeau à chaque tour : dégradé avant, hybride après."""
    monkeypatch.setattr(rag_pipeline.qdrant_index, "build_index", _construction_lente(0.2))
    resultats_bm25 = [({"chunk_id": "c1"}, 1.0)]
    monkeypatch.setattr(
        rag_pipeline.bm25_index, "search", lambda *a, **k: resultats_bm25
    )
    appels_semantiques = []

    def search_semantique(*args, **kwargs):
        appels_semantiques.append(args)
        return []

    monkeypatch.setattr(rag_pipeline.qdrant_index, "search", search_semantique)

    pipeline = rag_pipeline.RagPipeline()
    pipeline.retrieve("apl")
    assert appels_semantiques == [], "la couche sémantique a été interrogée avant d'exister"

    _attendre(lambda: pipeline.semantic_available, "la bascule en hybride n'a pas eu lieu")
    pipeline.retrieve("apl")
    assert appels_semantiques, "le tour suivant la bascule est resté en BM25 seul"


def _attendre(condition, message: str, limite_s: float = 5.0) -> None:
    """Attend qu'une condition devienne vraie, sans dormir une durée fixe.

    Une `sleep` calibrée sur la machine du jour finit par échouer sur une machine
    plus lente ou plus chargée ; la scruter tient dans les deux cas."""
    echeance = time.perf_counter() + limite_s
    while time.perf_counter() < echeance:
        if condition():
            return
        time.sleep(0.01)
    pytest.fail(message)
