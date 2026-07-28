from . import bm25_index
from . import qdrant_index

QUERY = "Quels documents pour l'APL ?"
TARGET_IDS = ["caf-etapes-step4_0", "caf-etapes-step1_0", "documents-caf-section2_0"]

bm25, chunks = bm25_index.build_index()
client, model = qdrant_index.build_index()

print(f"\n=== Requête: '{QUERY}' ===\n")

print("--- Top 15 BM25 (category=demarche) ---")
bm25_results = bm25_index.search(QUERY, bm25, chunks, top_k=15, category="demarche")
for rank, (chunk, score) in enumerate(bm25_results, 1):
    marker = " <-- CIBLE" if chunk["chunk_id"] in TARGET_IDS else ""
    print(f"  #{rank} score={score:.2f} {chunk['chunk_id']}{marker}")

print("\n--- Top 15 Qdrant/sémantique (category=demarche) ---")
semantic_results = qdrant_index.search(QUERY, client, model, top_k=15, category="demarche")
for rank, point in enumerate(semantic_results, 1):
    cid = point.payload["chunk_id"]
    marker = " <-- CIBLE" if cid in TARGET_IDS else ""
    print(f"  #{rank} score={point.score:.4f} {cid}{marker}")