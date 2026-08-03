"""Les objets lourds du moteur ne doivent être construits QU'UNE FOIS.

L'endpoint de l'assistant est un `def` synchrone : FastAPI le sert depuis un pool
de threads. Les objets coûteux (pipeline RAG, graphe juridique, graphe LangGraph)
étaient créés selon le motif « si c'est vide, je construis », sans verrou. Deux
requêtes simultanées voyaient donc toutes deux « vide » et construisaient chacune
la leur.

Ce n'est pas qu'un gaspillage de mémoire. Le magasin vectoriel est embarqué et
prend un verrou EXCLUSIF sur son dossier : la seconde ouverture échoue, l'échec
est rattrapé en « bascule sur BM25 seul », et c'est potentiellement cette
instance-là qui reste en cache pour toute la vie du process. L'assistant répond
alors en recherche lexicale seule, durablement, sans que rien ne l'ait décidé.

Ces tests lancent de vraies constructions concurrentes et comptent : une seule
doit avoir lieu, et tout le monde doit recevoir le même objet.
"""

from __future__ import annotations

import threading

import pytest

from app.modules.chatbot import service
from app.modules.chatbot.rag import legal_kg, legal_pipeline, orchestrator

NB_THREADS = 12


def _en_parallele(action, nb=NB_THREADS):
    """Lance `action` depuis `nb` threads relâchés en même temps, et rend les résultats.

    La barrière est ce qui donne son sens au test : sans elle, les threads
    démarreraient les uns après les autres et le premier aurait fini de construire
    avant que le second ne regarde."""
    depart = threading.Barrier(nb)
    resultats: list = []
    erreurs: list = []
    verrou = threading.Lock()

    def executer():
        depart.wait()
        try:
            valeur = action()
        except Exception as exc:  # noqa: BLE001 — remonté à la fin du test
            with verrou:
                erreurs.append(exc)
            return
        with verrou:
            resultats.append(valeur)

    threads = [threading.Thread(target=executer) for _ in range(nb)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert not erreurs, f"construction en erreur : {erreurs[0]!r}"
    return resultats


class _Compteur:
    """Objet à construction lente, pour élargir la fenêtre de course."""

    constructions = 0
    _verrou = threading.Lock()

    def __init__(self, *_args, **_kwargs):
        with _Compteur._verrou:
            _Compteur.constructions += 1
        # Sans cette pause, la construction serait si rapide que deux threads
        # pourraient ne jamais se chevaucher : le test passerait sans rien prouver.
        threading.Event().wait(0.05)

    @classmethod
    def remettre_a_zero(cls):
        cls.constructions = 0


@pytest.fixture(autouse=True)
def compteur():
    _Compteur.remettre_a_zero()
    return _Compteur


def test_le_pipeline_rag_nest_construit_quune_fois(monkeypatch, compteur):
    """Le cas le plus coûteux : deux constructions = deux modèles d'embeddings en
    mémoire, et deux ouvertures du dossier Qdrant, qui n'en admet qu'une."""
    monkeypatch.setattr(orchestrator, "_rag_pipeline_instance", None)
    monkeypatch.setattr(orchestrator.rag_pipeline, "RagPipeline", compteur)

    obtenus = _en_parallele(orchestrator.get_rag_pipeline)

    assert compteur.constructions == 1
    assert len(obtenus) == NB_THREADS
    assert all(o is obtenus[0] for o in obtenus), "tous doivent recevoir le même objet"


def test_le_graphe_juridique_nest_charge_quune_fois(monkeypatch, compteur):
    """Le plus exposé : il se charge à la première question juridique, donc en plein
    trafic, et non au démarrage comme les index."""
    monkeypatch.setattr(legal_kg, "_kg_instance", None)

    class FauxGraphe(_Compteur):
        meta = {"nb_articles": 1, "nb_articles_avec_texte": 1,
                "nb_versions": 1, "nb_liens": 1}

    monkeypatch.setattr(legal_kg, "KgLocal", FauxGraphe)

    obtenus = _en_parallele(legal_kg.get_kg)

    assert compteur.constructions == 1
    assert all(o is obtenus[0] for o in obtenus)


def test_le_pipeline_juridique_nest_construit_quune_fois(monkeypatch, compteur):
    monkeypatch.setattr(legal_pipeline, "_legal_pipeline_instance", None)
    monkeypatch.setattr(legal_pipeline, "LegalPipeline", compteur)

    obtenus = _en_parallele(lambda: legal_pipeline.get_legal_pipeline(object()))

    assert compteur.constructions == 1
    assert all(o is obtenus[0] for o in obtenus)


def test_le_graphe_langgraph_nest_compile_quune_fois(monkeypatch, compteur):
    monkeypatch.setattr(service, "_graph", None)
    monkeypatch.setattr(service.orchestrator, "build_graph", compteur)

    obtenus = _en_parallele(service._get_graph)

    assert compteur.constructions == 1
    assert all(o is obtenus[0] for o in obtenus)


def test_un_seul_cache_pour_le_pipeline_juridique(monkeypatch, compteur):
    """L'orchestrateur tenait son PROPRE singleton en plus de celui de `legal_pipeline` :
    deux caches pour un objet. Vider celui qui construit doit suffire à tout vider."""
    assert not hasattr(orchestrator, "_legal_pipeline_instance")

    monkeypatch.setattr(orchestrator, "_rag_pipeline_instance", object())
    monkeypatch.setattr(legal_pipeline, "_legal_pipeline_instance", None)
    monkeypatch.setattr(legal_pipeline, "LegalPipeline", compteur)

    premier = orchestrator.get_legal_pipeline()
    second = orchestrator.get_legal_pipeline()

    assert premier is second
    assert compteur.constructions == 1
