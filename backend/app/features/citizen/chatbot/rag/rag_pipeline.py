"""
Module RAG de production pour la branche 'rag_general' de l'orchestrateur D4.
Contrairement à hybrid_search.py (qui sert de banc de test), ce module est
conçu pour être importé et initialisé UNE SEULE FOIS au démarrage de l'app
(construire les index est coûteux), puis interrogé plusieurs fois.
"""
from . import bm25_index
from . import qdrant_index
from .hybrid_search import reciprocal_rank_fusion
from .llm_client import call_llm

GENERATION_SYSTEM_PROMPT = """Tu es un assistant qui aide les citoyens à comprendre l'aide au logement (APL).
Réponds en langage simple et clair (vulgarisé), pas de jargon juridique.

RÈGLES STRICTES :
- Réponds UNIQUEMENT à partir des extraits fournis ci-dessous. N'invente jamais une information absente des extraits.
- Si les extraits ne permettent pas de répondre correctement, dis-le clairement plutôt que d'inventer.
- Cite la source (l'URL) de l'information utilisée à la fin de ta réponse.
- Si la réponse dépend de la situation ou du profil du citoyen (statut, ressources, composition du
  foyer, type de logement...) et que cette information manque dans la conversation, pose une question
  de clarification au lieu de répondre directement.
- Ne pose jamais plus de 2 questions de clarification au total sur une même conversation (regarde
  l'historique fourni pour savoir combien tu en as déjà posées). Passé ce nombre, réponds avec les
  meilleures informations disponibles à partir des extraits, en signalant les limites de ta réponse.
"""


class RagPipeline:
    def __init__(self):
        print("Initialisation du pipeline RAG (une seule fois)...")
        self.bm25, self.chunks = bm25_index.build_index()
        self.qdrant_client, self.embedding_model = qdrant_index.build_index()
        print("Pipeline RAG prêt.\n")

    def retrieve(self, query, top_k=3, category="demarche"):
        bm25_results = bm25_index.search(query, self.bm25, self.chunks, top_k=10, category=category)
        semantic_results = qdrant_index.search(query, self.qdrant_client, self.embedding_model, top_k=10, category=category)
        fused = reciprocal_rank_fusion(bm25_results, semantic_results, top_k=top_k)
        return fused  # liste de (chunk, score)

    def generate_answer(self, query, retrieved_chunks, conversation_history=None):
        context = "\n\n".join(
            f"[Extrait {i+1}] (source: {chunk['source_url']})\n{chunk['text']}"
            for i, (chunk, _score) in enumerate(retrieved_chunks)
        )
        user_prompt = f"Extraits disponibles :\n\n{context}\n\nQuestion du citoyen : {query}"

        messages = [{"role": "system", "content": GENERATION_SYSTEM_PROMPT}]
        messages.extend(conversation_history or [])
        messages.append({"role": "user", "content": user_prompt})

        answer = call_llm(messages=messages, temperature=0.2)
        return answer

    def answer(self, query, top_k=3, category="demarche", conversation_history=None):
        retrieved = self.retrieve(query, top_k=top_k, category=category)
        answer_text = self.generate_answer(query, retrieved, conversation_history=conversation_history)
        sources = list({chunk["source_url"] for chunk, _ in retrieved})
        return {"answer": answer_text, "sources": sources, "retrieved_chunks": retrieved}


if __name__ == "__main__":
    pipeline = RagPipeline()

    test_query = "Quels documents pour l'APL ?"
    result = pipeline.answer(test_query)

    print(f"Question: {test_query}\n")
    print(f"Réponse:\n{result['answer']}\n")
    print(f"Sources: {result['sources']}")