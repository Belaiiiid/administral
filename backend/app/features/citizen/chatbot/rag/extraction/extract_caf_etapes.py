import json
from bs4 import BeautifulSoup

INPUT_HTML = "caf_etapes.html"
OUTPUT_FILE = "caf_etapes.json"
SOURCE_URL = "https://caf.fr/allocataires/caf-du-var/offre-de-service/logement/je-suis-etudiant-etou-apprenti/les-etapes-cles-pour-faire-sa-demande-d-aide-au-logement"
SOURCE_TITLE = "Les étapes clés pour faire sa demande d'aide au logement - CAF"
CATEGORY = "demarche"

with open(INPUT_HTML, encoding="utf-8") as f:
    soup = BeautifulSoup(f, "html.parser")

togglers = soup.find_all("a", class_="ckeditor-accordion-toggler")

records = []
for i, t in enumerate(togglers):
    title = t.get_text(strip=True)
    dt = t.parent
    dd = dt.find_next_sibling("dd")
    if not dd:
        continue
    content = dd.get_text(separator=" ", strip=True)
    content = " ".join(content.split())
    if not content:
        continue
    records.append({
        "id": f"caf-etapes-step{i+1}",
        "question": title,   # on garde le nom de champ "question" pour rester compatible
        "answer": content,   # avec le schéma existant (texte = question + réponse)
        "source_url": SOURCE_URL,
        "source_title": SOURCE_TITLE,
        "category": CATEGORY
    })

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print(f"{len(records)} étapes extraites\n")
for r in records:
    print(f"- {r['question']}  ({len(r['answer'])} car.)")