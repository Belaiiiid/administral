import json
import re
import pickle
import glob
import os
import hashlib
import time
from rank_bm25 import BM25Okapi

from app.core.logger import logger

# Paths resolved relative to this module (the data now ships inside the package),
# so retrieval works regardless of the process working directory (uvicorn runs
# from backend/). Only the base path changed — the file layout is unchanged.
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHUNKS_DIR = os.path.join(_BASE_DIR, "data", "chunks")  # un fichier chunks_<source_id>.json par source
INDEX_FILE = os.path.join(_BASE_DIR, "bm25_index.pkl")

TOKEN_RE = re.compile(r"[a-zàâäéèêëïîôöùûüç0-9]+", re.IGNORECASE)

def tokenize(text):
    return TOKEN_RE.findall(text.lower())

def load_all_chunks():
    """Charge et fusionne les chunks de TOUTES les sources présentes dans data/chunks/.
    Ajouter une nouvelle source = juste déposer un nouveau fichier chunks_*.json ici,
    aucun changement de code requis.

    Le détail par source part dans UNE ligne structurée, pas une ligne par fichier :
    c'est un même événement (« voici le corpus chargé »), et le compte par source est
    précisément ce qu'on veut pouvoir comparer d'un démarrage à l'autre pour repérer
    une source qui a disparu."""
    chunks = []
    par_source = {}
    for path in sorted(glob.glob(f"{CHUNKS_DIR}/chunks_*.json")):
        with open(path, encoding="utf-8") as f:
            source_chunks = json.load(f)
        chunks.extend(source_chunks)
        par_source[os.path.basename(path)] = len(source_chunks)
    logger.info(
        "chatbot: corpus chargé",
        {"total": len(chunks), "sources": len(par_source), "par_source": par_source},
    )
    return chunks

def compute_fingerprint():
    """Empreinte basée sur les dates de modification des fichiers chunks_*.json.
    Change dès qu'un fichier est régénéré (même logique que build_pipeline.py)."""
    paths = sorted(glob.glob(f"{CHUNKS_DIR}/chunks_*.json"))
    parts = [f"{p}:{os.path.getmtime(p)}" for p in paths]
    return hashlib.md5("|".join(parts).encode()).hexdigest()

def build_index():
    debut = time.perf_counter()
    fingerprint = compute_fingerprint()

    if os.path.exists(INDEX_FILE):
        with open(INDEX_FILE, "rb") as f:
            cached = pickle.load(f)
        if cached.get("fingerprint") == fingerprint:
            logger.info(
                "chatbot: index BM25 chargé depuis le cache",
                {"chunks": len(cached["chunks"]), "duree_ms": round((time.perf_counter() - debut) * 1000)},
            )
            return cached["bm25"], cached["chunks"]

    chunks = load_all_chunks()

    tokenized_corpus = [tokenize(c["text"]) for c in chunks]
    bm25 = BM25Okapi(tokenized_corpus)

    with open(INDEX_FILE, "wb") as f:
        pickle.dump({"bm25": bm25, "chunks": chunks, "fingerprint": fingerprint}, f)

    logger.info(
        "chatbot: index BM25 reconstruit",
        {"chunks": len(chunks), "duree_ms": round((time.perf_counter() - debut) * 1000)},
    )
    return bm25, chunks

def search(query, bm25, chunks, top_k=3, category=None):
    """category: None (pas de filtre), une catégorie (str), ou une liste de catégories
    (ex: ["demarche", "legislation"] pour un accès agent élargi)."""
    tokenized_query = tokenize(query)
    scores = bm25.get_scores(tokenized_query)
    candidate_indices = range(len(chunks))
    if category:
        allowed = {category} if isinstance(category, str) else set(category)
        candidate_indices = [i for i in candidate_indices if chunks[i].get("category") in allowed]
    ranked = sorted(candidate_indices, key=lambda i: scores[i], reverse=True)[:top_k]
    return [(chunks[i], scores[i]) for i in ranked]

if __name__ == "__main__":
    bm25, chunks = build_index()

    test_query = "Comment est calculée l'APL ?"
    results = search(test_query, bm25, chunks, top_k=3)

    print(f"\nRequête test: '{test_query}'")
    for rank, (chunk, score) in enumerate(results, 1):
        print(f"\n#{rank} (score={score:.2f}) - {chunk['chunk_id']}")
        print(chunk["text"][:200], "...")