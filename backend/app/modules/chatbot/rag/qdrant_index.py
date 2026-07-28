import json
import glob
import os
import hashlib
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from sentence_transformers import SentenceTransformer

# Paths resolved relative to this module so the embedded Qdrant store and the
# chunks are found regardless of the process working directory. File layout and
# logic are unchanged.
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHUNKS_DIR = os.path.join(_BASE_DIR, "data", "chunks")
QDRANT_PATH = os.path.join(_BASE_DIR, "qdrant_data")
COLLECTION_NAME = "apl_chunks"
MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"  # léger, multilingue, tourne en local
FINGERPRINT_FILE = os.path.join(_BASE_DIR, "qdrant_index.fingerprint")


def compute_fingerprint():
    """Même logique que bm25_index.py: empreinte basée sur les dates de
    modification des fichiers chunks_*.json."""
    paths = sorted(glob.glob(f"{CHUNKS_DIR}/chunks_*.json"))
    parts = [f"{p}:{os.path.getmtime(p)}" for p in paths]
    return hashlib.md5("|".join(parts).encode()).hexdigest()


def load_all_chunks():
    """Même logique que bm25_index.py : charge tous les fichiers chunks_*.json,
    peu importe la source d'origine."""
    chunks = []
    for path in sorted(glob.glob(f"{CHUNKS_DIR}/chunks_*.json")):
        with open(path, encoding="utf-8") as f:
            source_chunks = json.load(f)
        chunks.extend(source_chunks)
        print(f"  {path}: {len(source_chunks)} chunks")
    return chunks


def build_index():
    fingerprint = compute_fingerprint()

    print(f"\nChargement du modèle d'embeddings '{MODEL_NAME}'...")
    model = SentenceTransformer(MODEL_NAME)  # nécessaire dans tous les cas pour encoder les requêtes plus tard

    client = QdrantClient(path=QDRANT_PATH)

    if (
        os.path.exists(FINGERPRINT_FILE)
        and client.collection_exists(COLLECTION_NAME)
        and client.count(COLLECTION_NAME).count > 0
    ):
        with open(FINGERPRINT_FILE) as f:
            saved_fingerprint = f.read().strip()
        if saved_fingerprint == fingerprint:
            count = client.count(COLLECTION_NAME).count
            print(f"Index Qdrant déjà à jour ({count} chunks), pas de régénération des embeddings -> {QDRANT_PATH}")
            return client, model

    print("Chargement des chunks par source:")
    chunks = load_all_chunks()

    vector_size = model.get_sentence_embedding_dimension()
    print(f"Dimension des vecteurs: {vector_size}")

    print("Génération des embeddings...")
    texts = [c["text"] for c in chunks]
    embeddings = model.encode(texts, show_progress_bar=True)

    if client.collection_exists(COLLECTION_NAME):
        client.delete_collection(COLLECTION_NAME)
    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
    )

    points = [
        PointStruct(
            id=i,
            vector=embeddings[i].tolist(),
            payload=chunks[i],  # on garde tout le chunk (text, question, source_url, chunk_id...)
        )
        for i in range(len(chunks))
    ]
    client.upsert(collection_name=COLLECTION_NAME, points=points)

    with open(FINGERPRINT_FILE, "w") as f:
        f.write(fingerprint)

    print(f"\n{len(points)} chunks (re)indexés dans Qdrant (local: {QDRANT_PATH})")
    return client, model


def search(query, client, model, top_k=3, category=None):
    query_vector = model.encode(query).tolist()
    query_filter = None
    if category:
        query_filter = Filter(
            must=[FieldCondition(key="category", match=MatchValue(value=category))]
        )
    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=top_k,
        query_filter=query_filter,
    )
    return results.points


if __name__ == "__main__":
    client, model = build_index()

    test_query = "Comment est calculée l'APL ?"
    results = search(test_query, client, model, top_k=3)

    print(f"\nRequête test: '{test_query}'")
    for rank, point in enumerate(results, 1):
        chunk = point.payload
        print(f"\n#{rank} (score={point.score:.4f}) - {chunk['chunk_id']}")
        print(chunk["text"][:200], "...")