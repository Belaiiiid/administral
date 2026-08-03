import json
import glob
import os
import hashlib
import time
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchAny

from app.core.logger import logger
# Le chargement des chunks était dupliqué à l'identique ici et dans `bm25_index` — deux
# copies du même parcours de `data/chunks/`, donc deux endroits à corriger le jour où le
# format change. Les deux index lisent le même corpus : une seule lecture fait foi.
from . import bm25_index

# `sentence_transformers` (et le torch qu'il tire) est importé DANS build_index et non
# ici : c'est le seul endroit qui en a besoin, `search` recevant le modèle déjà chargé.
# Au niveau du module, il faisait payer une trentaine de secondes de chargement à tout
# ce qui importe l'orchestrateur - y compris une suite de tests qui ne cherche rien.

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
    return bm25_index.load_all_chunks()


def build_index():
    from sentence_transformers import SentenceTransformer

    debut = time.perf_counter()
    fingerprint = compute_fingerprint()

    model = SentenceTransformer(MODEL_NAME)  # nécessaire dans tous les cas pour encoder les requêtes plus tard
    logger.info(
        "chatbot: modèle d'embeddings chargé",
        {"modele": MODEL_NAME, "duree_ms": round((time.perf_counter() - debut) * 1000)},
    )

    client = QdrantClient(path=QDRANT_PATH)

    if (
        os.path.exists(FINGERPRINT_FILE)
        and client.collection_exists(COLLECTION_NAME)
        and client.count(COLLECTION_NAME).count > 0
    ):
        with open(FINGERPRINT_FILE) as f:
            saved_fingerprint = f.read().strip()
        if saved_fingerprint == fingerprint:
            logger.info(
                "chatbot: index Qdrant à jour, embeddings non régénérés",
                {
                    "chunks": client.count(COLLECTION_NAME).count,
                    "duree_ms": round((time.perf_counter() - debut) * 1000),
                },
            )
            return client, model

    chunks = load_all_chunks()

    vector_size = model.get_sentence_embedding_dimension()
    # La régénération est la seule opération vraiment longue du démarrage : on l'annonce
    # AVANT de la lancer, sinon un log qui n'apparaît qu'à la fin laisse croire à un gel.
    logger.info(
        "chatbot: génération des embeddings en cours",
        {"chunks": len(chunks), "dimension": vector_size},
    )
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

    logger.info(
        "chatbot: index Qdrant reconstruit",
        {
            "chunks": len(points),
            "dimension": vector_size,
            "duree_ms": round((time.perf_counter() - debut) * 1000),
        },
    )
    return client, model


def search(query, client, model, top_k=3, category=None):
    """category: None (pas de filtre), une catégorie (str), ou une liste de catégories
    (ex: ["demarche", "legislation"] pour un accès agent élargi)."""
    query_vector = model.encode(query).tolist()
    query_filter = None
    if category:
        allowed = [category] if isinstance(category, str) else list(category)
        query_filter = Filter(
            must=[FieldCondition(key="category", match=MatchAny(any=allowed))]
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