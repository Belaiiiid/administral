"""
Orchestrateur de build du corpus RAG.
Ne relance l'extraction + chunking d'une source QUE si son fichier HTML
source est plus récent que les chunks déjà générés (sinon: rien à faire).

Arborescence attendue (exécuter depuis la racine du projet apl-rag/):
    extraction/    <- html source, scripts extract_*.py, json intermédiaires
    data/chunks/   <- json de chunks finaux (généré par chunking.py)

Usage: python build_pipeline.py
"""
import os
import subprocess
import sys

EXTRACTION_DIR = "extraction"

# Chemins relatifs à EXTRACTION_DIR pour html/extract_script/extracted_json.
# chunks_json reste relatif à la racine (data/chunks/...).
SOURCES = [
    {
        "html": "apl.html",
        "extract_script": "extract_faq.py",
        "extracted_json": "apl_caf_faq.json",
        "chunks_json": "data/chunks/chunks_apl_caf_faq.json",
    },
    {
        "html": "apl.html",
        "extract_script": "extract_infographie.py",
        "extracted_json": "infographie.json",
        "chunks_json": "data/chunks/chunks_infographie.json",
    },
    {
        "html": "caf_etapes.html",
        "extract_script": "extract_caf_etapes.py",
        "extracted_json": "caf_etapes.json",
        "chunks_json": "data/chunks/chunks_caf_etapes.json",
    },
    {
        "html": "document_apl.html",
        "extract_script": "extract_document_caf.py",
        "extracted_json": "documents_caf.json",
        "chunks_json": "data/chunks/chunks_documents_caf.json",
    },
]


def needs_rebuild(source):
    html_path = os.path.join(EXTRACTION_DIR, source["html"])
    chunks_path = source["chunks_json"]

    if not os.path.exists(chunks_path):
        return True  # jamais généré
    return os.path.getmtime(html_path) > os.path.getmtime(chunks_path)


def rebuild(source):
    print(f"  -> extraction: {source['extract_script']}")
    subprocess.run(
        [sys.executable, source["extract_script"]],
        cwd=EXTRACTION_DIR,  # le script tourne DANS extraction/, ses chemins internes restent inchangés
        check=True, stdout=subprocess.DEVNULL,
    )
    extracted_json_path = os.path.join(EXTRACTION_DIR, source["extracted_json"])
    print(f"  -> chunking: {extracted_json_path} -> {source['chunks_json']}")
    subprocess.run(
        [sys.executable, "chunking.py", extracted_json_path, source["chunks_json"]],
        check=True, stdout=subprocess.DEVNULL,
    )


if __name__ == "__main__":
    os.makedirs("data/chunks", exist_ok=True)

    for source in SOURCES:
        html_path = os.path.join(EXTRACTION_DIR, source["html"])
        if not os.path.exists(html_path):
            print(f"[IGNORÉ] {html_path} absent")
            continue

        print(f"[{html_path}]")
        if needs_rebuild(source):
            rebuild(source)
            print(f"  -> régénéré\n")
        else:
            print(f"  -> à jour, rien à faire\n")

    print("Build terminé. Lance bm25_index.py / qdrant_index.py pour (re)construire les index.")