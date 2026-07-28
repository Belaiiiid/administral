import json
import re
import pickle
import glob
import os
import hashlib
from rank_bm25 import BM25Okapi

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
    aucun changement de code requis."""
    chunks = []
    for path in sorted(glob.glob(f"{CHUNKS_DIR}/chunks_*.json")):
        with open(path, encoding="utf-8") as f:
            source_chunks = json.load(f)
        chunks.extend(source_chunks)
        print(f"  {path}: {len(source_chunks)} chunks")
    return chunks

def compute_fingerprint():
    """Empreinte basée sur les dates de modification des fichiers chunks_*.json.
    Change dès qu'un fichier est régénéré (même logique que build_pipeline.py)."""
    paths = sorted(glob.glob(f"{CHUNKS_DIR}/chunks_*.json"))
    parts = [f"{p}:{os.path.getmtime(p)}" for p in paths]
    return hashlib.md5("|".join(parts).encode()).hexdigest()

def build_index():
    fingerprint = compute_fingerprint()

    if os.path.exists(INDEX_FILE):
        with open(INDEX_FILE, "rb") as f:
            cached = pickle.load(f)
        if cached.get("fingerprint") == fingerprint:
            print(f"Index BM25 déjà à jour ({len(cached['chunks'])} chunks), chargement depuis le cache -> {INDEX_FILE}")
            return cached["bm25"], cached["chunks"]

    print("Chargement des chunks par source:")
    chunks = load_all_chunks()

    tokenized_corpus = [tokenize(c["text"]) for c in chunks]
    bm25 = BM25Okapi(tokenized_corpus)

    with open(INDEX_FILE, "wb") as f:
        pickle.dump({"bm25": bm25, "chunks": chunks, "fingerprint": fingerprint}, f)

    print(f"\nIndex BM25 (re)construit sur {len(chunks)} chunks (toutes sources confondues) -> {INDEX_FILE}")
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