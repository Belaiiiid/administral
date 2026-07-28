"""
Module RAG de production pour la branche 'rag_general' de l'orchestrateur D4.
Contrairement à hybrid_search.py (qui sert de banc de test), ce module est
conçu pour être importé et initialisé UNE SEULE FOIS au démarrage de l'app
(construire les index est coûteux), puis interrogé plusieurs fois.

Résilience : la recherche sémantique (Qdrant + modèle d'embeddings
sentence-transformers) exige de télécharger un modèle au premier démarrage. Si ce
téléchargement échoue ou traîne (pas de réseau, incompatibilité de librairie,
environnement hors-ligne), le pipeline NE DOIT PAS rester bloqué ni tomber en
panne : il bascule sur une recherche BM25 seule (lexicale, pur Python, aucun
téléchargement) qui suffit à fournir des réponses citées. La génération (Mistral)
reste identique dans les deux cas. C'est ce qui garantit que l'assistant répond
toujours, même sans la couche sémantique.
"""
import os
import threading

from . import bm25_index
from . import qdrant_index
from .hybrid_search import reciprocal_rank_fusion
from .llm_client import call_llm_structured

# La recherche sémantique est activée par défaut mais bornée : si l'index n'est
# pas prêt dans ce délai (typiquement le téléchargement du modèle d'embeddings au
# tout premier démarrage), on démarre en BM25 seul plutôt que de bloquer. Réglable
# par variable d'environnement pour les déploiements où le modèle est déjà en
# cache (délai plus court) ou volontairement désactivé (CHATBOT_SEMANTIC=0).
_SEMANTIC_ENABLED = os.environ.get("CHATBOT_SEMANTIC", "1").lower() not in ("0", "false", "no")
_SEMANTIC_TIMEOUT_S = float(os.environ.get("CHATBOT_SEMANTIC_TIMEOUT_S", "25"))

GENERATION_SYSTEM_PROMPT = """Tu es un assistant qui aide les citoyens à comprendre l'aide au logement (APL).
Réponds en langage simple et clair (vulgarisé), pas de jargon juridique.

STYLE :
- Réponds de manière directe et professionnelle, comme un conseiller s'adressant à un citoyen.
- Ne commence JAMAIS par une formule du type "D'après les informations disponibles", "Selon les
  extraits fournis" ou équivalent - le citoyen n'a pas besoin de savoir comment tu as obtenu
  l'information. Donne directement la réponse.

RÈGLES STRICTES :
- Réponds UNIQUEMENT à partir des extraits fournis ci-dessous. N'invente jamais une information absente des extraits.
- Si les extraits ne permettent pas de répondre correctement, dis-le clairement plutôt que d'inventer.
- Si la réponse dépend de la situation ou du profil du citoyen (statut, ressources, composition du
  foyer, type de logement...) et que cette information manque dans la conversation, pose une question
  de clarification au lieu de répondre directement.
- Ne pose jamais plus de 4 questions de clarification au total sur une même question (regarde
  l'historique fourni pour savoir combien tu en as déjà posées). Passé ce nombre, réponds avec les
  meilleures informations disponibles à partir des extraits, en signalant les limites de ta réponse.
- Si le citoyen répond "Je ne comprends pas, expliquez-moi" à une clarification, explique le terme
  ou la question en langage très simple (un exemple concret aide), PUIS repose la même question
  (reformulée plus simplement si possible) - ne l'ignore pas et ne réponds pas à sa place.

FORMAT DE SORTIE :
Réponds UNIQUEMENT avec un JSON de la forme :
{"type": "answer", "text": "..."}
ou, si tu as besoin d'une clarification :
{"type": "clarification", "text": "la question posée au citoyen", "options": [...] ou null}
- "options": liste de choix courts (2 à 4) si la question a un nombre limité de réponses plausibles
  (ex: statut du logement). Mets "options": null si la réponse attendue est une valeur libre (ex: un
  montant, une date) - dans ce cas ne mets PAS de liste, le citoyen répondra en texte libre.
- Ne mets PAS toi-même d'option "passer cette question" ou "je ne comprends pas" dans ta liste -
  elles sont ajoutées automatiquement, inutile de les dupliquer.
"""


class RagPipeline:
    def __init__(self):
        print("Initialisation du pipeline RAG (une seule fois)...")
        # BM25 : pur Python, aucune dépendance réseau — toujours disponible.
        self.bm25, self.chunks = bm25_index.build_index()

        # Sémantique : optionnelle et bornée. Une panne ou une lenteur ici ne doit
        # jamais empêcher l'assistant de répondre.
        self.qdrant_client = None
        self.embedding_model = None
        self.semantic_available = False
        if _SEMANTIC_ENABLED:
            self._try_build_semantic()

        mode = "hybride (BM25 + sémantique)" if self.semantic_available else "BM25 seul"
        print(f"Pipeline RAG prêt — recherche {mode}.\n")

    def _try_build_semantic(self):
        """Construit l'index sémantique avec un délai maximal.

        Le chargement du modèle d'embeddings peut se bloquer indéfiniment (premier
        téléchargement sans réseau, client HTTP fermé, etc.). On l'exécute donc
        dans un thread borné : s'il n'aboutit pas à temps, on continue en BM25
        seul. Le thread restant est daemon — il mourra avec le process."""
        result: dict = {}

        def build():
            try:
                result["value"] = qdrant_index.build_index()
            except Exception as exc:  # noqa: BLE001 — capturé pour dégrader proprement
                result["error"] = exc

        worker = threading.Thread(target=build, name="rag-semantic-build", daemon=True)
        worker.start()
        worker.join(_SEMANTIC_TIMEOUT_S)

        if worker.is_alive():
            print(
                f"[RAG] Index sémantique non prêt en {_SEMANTIC_TIMEOUT_S:.0f}s "
                "(modèle d'embeddings indisponible ?) — bascule sur BM25 seul."
            )
            return
        if "value" in result:
            self.qdrant_client, self.embedding_model = result["value"]
            self.semantic_available = True
        else:
            print(
                f"[RAG] Index sémantique indisponible ({result.get('error')}) "
                "— bascule sur BM25 seul."
            )

    def retrieve(self, query, top_k=3, category="demarche"):
        """category: une catégorie (str) ou une liste de catégories (ex: ["demarche", "legislation"]) -
        voir orchestrator.CATEGORIES_BY_ROLE pour le filtrage selon le rôle (citoyen/agent)."""
        bm25_results = bm25_index.search(query, self.bm25, self.chunks, top_k=10, category=category)

        # BM25 seul : on renvoie directement les meilleurs résultats lexicaux.
        if not self.semantic_available:
            return bm25_results[:top_k]

        # Hybride : on fusionne lexical + sémantique. Une panne sémantique en cours
        # de route (Qdrant, encodage) retombe elle aussi sur BM25.
        try:
            semantic_results = qdrant_index.search(
                query, self.qdrant_client, self.embedding_model, top_k=10, category=category
            )
        except Exception:  # noqa: BLE001 — la recherche doit toujours renvoyer quelque chose
            return bm25_results[:top_k]
        return reciprocal_rank_fusion(bm25_results, semantic_results, top_k=top_k)

    def generate_answer(self, query, retrieved_chunks, conversation_history=None, model="mistral-small-latest", provider="mistral"):
        """Retourne un dict {"type": "answer"|"clarification", "text": str, "options": list|None}.
        En cas de JSON malformé (jamais de crash), repli sur {"type": "answer", "text": <texte brut>}."""
        context = "\n\n".join(
            f"[Extrait {i+1}] (source: {chunk['source_url']})\n{chunk['text']}"
            for i, (chunk, _score) in enumerate(retrieved_chunks)
        )
        user_prompt = f"Extraits disponibles :\n\n{context}\n\nQuestion du citoyen : {query}"

        messages = [{"role": "system", "content": GENERATION_SYSTEM_PROMPT}]
        messages.extend(conversation_history or [])
        messages.append({"role": "user", "content": user_prompt})

        return call_llm_structured(messages=messages, model=model, provider=provider, temperature=0.2)

    def answer(self, query, top_k=3, category="demarche", conversation_history=None, model="mistral-small-latest", provider="mistral"):
        retrieved = self.retrieve(query, top_k=top_k, category=category)
        generated = self.generate_answer(query, retrieved, conversation_history=conversation_history, model=model, provider=provider)
        sources = list({chunk["source_url"] for chunk, _ in retrieved})
        return {**generated, "sources": sources, "retrieved_chunks": retrieved}


if __name__ == "__main__":
    pipeline = RagPipeline()

    test_query = "Quels documents pour l'APL ?"
    result = pipeline.answer(test_query)

    print(f"Question: {test_query}\n")
    print(f"[{result['type']}] {result['text']}")
    if result["options"]:
        print(f"Options: {result['options']}")
    print(f"Sources: {result['sources']}")