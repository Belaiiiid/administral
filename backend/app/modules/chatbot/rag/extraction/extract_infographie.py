"""
Extraction dédiée pour l'infographie "10 questions clés sur l'APL".
Traitée séparément de extract_faq.py car sa structure interne (10 Q/R propres,
transcription d'image) est différente du reste de la FAQ (voir discussion
du 2026-07-22 : le chunking par phrases avait cassé cette structure et
pollué la recherche sémantique).
"""
import json
from bs4 import BeautifulSoup

INPUT_HTML = "apl.html"
OUTPUT_FILE = "infographie.json"
SOURCE_URL = "https://www.service-public.fr/particuliers/vosdroits/F12006"
SOURCE_TITLE = "10 questions clés sur l'APL (infographie) - Service-Public.fr"
CATEGORY = "demarche"
PANEL_ID = "accordion-chapter-chapitre11-situation1"

with open(INPUT_HTML, encoding="utf-8") as f:
    soup = BeautifulSoup(f, "html.parser")

panel = soup.find(id=PANEL_ID)
paras = [p.get_text(strip=True) for p in panel.find_all("p", attrs={"data-test": "contenu-texte"})]

# le contenu est dupliqué dans le DOM (texte caché + modale) : on coupe à la 2e occurrence du 1er paragraphe
if paras.count(paras[0]) > 1:
    second_occurrence = paras.index(paras[0], 1)
    paras = paras[:second_occurrence]

# on saute l'intro (titre, sous-titre, chapeau) : les 3 premiers paragraphes ne sont pas des Q/R
intro, paras = paras[:3], paras[3:]

records = []
current_question = None
current_answer_parts = []


def flush(idx):
    if current_question and current_answer_parts:
        records.append({
            "id": f"infographie-q{idx}",
            "question": current_question,
            "answer": " ".join(current_answer_parts),
            "source_url": SOURCE_URL,
            "source_title": SOURCE_TITLE,
            "category": CATEGORY,
        })


q_index = 0
for p in paras:
    if p.endswith("?"):
        flush(q_index)
        q_index += 1
        current_question = p
        current_answer_parts = []
    else:
        current_answer_parts.append(p)
flush(q_index)  # dernière question en attente

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print(f"{len(records)} paires Q/R extraites proprement\n")
for r in records:
    print(f"- {r['question']}  ({len(r['answer'])} car.)")