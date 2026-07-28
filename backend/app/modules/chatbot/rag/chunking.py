"""
Chunking générique, réutilisable pour n'importe quelle source déjà
extraite au format [{id, question, answer, source_url, source_title, category}, ...]

Usage:
    python chunking.py <input.json> <output_chunks.json>
"""
import json
import re
import sys

LONG_THRESHOLD = 2000
TARGET_CHUNK_SIZE = 800  # caractères, cible pour le regroupement de phrases

SENTENCE_SPLIT_RE = re.compile(r'(?<=[.!?])\s+(?=[A-ZÀ-Ý"\u2018\u2019])')


def split_sentences(text):
    sentences = SENTENCE_SPLIT_RE.split(text)
    return [s.strip() for s in sentences if s.strip()]


def group_sentences(sentences, target_size=TARGET_CHUNK_SIZE):
    groups = []
    current = []
    current_len = 0
    for s in sentences:
        if current and current_len + len(s) + 1 > target_size:
            groups.append(" ".join(current))
            current = []
            current_len = 0
        current.append(s)
        current_len += len(s) + 1
    if current:
        groups.append(" ".join(current))
    return groups


def make_chunk(record, chunk_index, text):
    return {
        "chunk_id": f"{record['id']}_{chunk_index}",
        "text": text,
        "question": record["question"],
        "source_url": record["source_url"],
        "source_title": record["source_title"],
        "category": record.get("category", "non_categorise"),
        "parent_id": record["id"],
        "chunk_index": chunk_index,
    }


def chunk_records(records):
    chunks = []
    for r in records:
        answer = r["answer"]
        if len(answer) <= LONG_THRESHOLD:
            text = f"Question: {r['question']} Réponse: {answer}"
            chunks.append(make_chunk(r, 0, text))
        else:
            sentences = split_sentences(answer)
            groups = group_sentences(sentences)
            for i, g in enumerate(groups):
                text = f"Question: {r['question']} Réponse (partie {i+1}/{len(groups)}): {g}"
                chunks.append(make_chunk(r, i, text))
    return chunks


if __name__ == "__main__":
    if len(sys.argv) == 3:
        input_file, output_file = sys.argv[1], sys.argv[2]
    else:
        # valeurs par défaut = comportement historique (source FAQ)
        input_file = "apl_caf_faq.json"
        output_file = "data/chunks/chunks_apl_caf_faq.json"

    with open(input_file, encoding="utf-8") as f:
        records = json.load(f)

    chunks = chunk_records(records)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False, indent=2)

    lengths = [len(c["text"]) for c in chunks]
    print(f"{input_file} -> {output_file}")
    print(f"Total: {len(chunks)} chunks")
    print(f"Taille min/moy/max: {min(lengths)} / {sum(lengths)//len(lengths)} / {max(lengths)} caractères")