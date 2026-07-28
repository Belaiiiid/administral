"""
Fusion hybride BM25 (lexical) + Qdrant (sémantique) via Reciprocal Rank Fusion (RRF).

RRF : pour chaque chunk, on combine son RANG (pas son score brut) dans chaque
méthode. Ça évite le problème des échelles de score différentes entre BM25
(scores non bornés) et Qdrant (similarité cosinus entre -1 et 1).

score_rrf(chunk) = somme sur chaque méthode de 1 / (k + rang_dans_cette_méthode)

k=60 est la valeur standard utilisée dans la littérature RRF (Cormack et al.).
"""

from . import bm25_index
from . import qdrant_index

K = 60  # constante standard RRF


def reciprocal_rank_fusion(bm25_results, semantic_results, top_k=3):
    """
    bm25_results: liste de (chunk, score) triée par pertinence décroissante
    semantic_results: liste de qdrant ScoredPoint triée par pertinence décroissante
    """
    rrf_scores = {}   # chunk_id -> score rrf cumulé
    chunk_lookup = {} # chunk_id -> chunk complet (payload)

    for rank, (chunk, _score) in enumerate(bm25_results, start=1):
        cid = chunk["chunk_id"]
        rrf_scores[cid] = rrf_scores.get(cid, 0) + 1 / (K + rank)
        chunk_lookup[cid] = chunk

    for rank, point in enumerate(semantic_results, start=1):
        chunk = point.payload
        cid = chunk["chunk_id"]
        rrf_scores[cid] = rrf_scores.get(cid, 0) + 1 / (K + rank)
        chunk_lookup[cid] = chunk

    ranked = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
    return [(chunk_lookup[cid], score) for cid, score in ranked[:top_k]]


if __name__ == "__main__":
    print("=== Construction index BM25 ===")
    bm25, chunks = bm25_index.build_index()

    print("\n=== Construction index Qdrant ===")
    client, model = qdrant_index.build_index()

    top_k = 3

    print(f"\n{'='*70}")
    print("Chat interactif (recherche hybride). Tapez exit() pour quitter.")
    print(f"{'='*70}")

    while True:
        query = input("\nVous: ").strip()
        if not query:
            continue
        if query.lower() in ("exit()", "exit", "quit", "quit()"):
            print("Fin de la session.")
            break

        bm25_results = bm25_index.search(query, bm25, chunks, top_k=10)
        semantic_results = qdrant_index.search(query, client, model, top_k=10)
        fused = reciprocal_rank_fusion(bm25_results, semantic_results, top_k=top_k)

        for rank, (chunk, score) in enumerate(fused, 1):
            print(f"\n#{rank} (rrf={score:.4f}) {chunk['chunk_id']}")
            print(f"  {chunk['text']}")