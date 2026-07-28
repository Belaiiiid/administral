import json
from bs4 import BeautifulSoup

INPUT_HTML = "document_apl.html"
OUTPUT_FILE = "documents_caf.json"
SOURCE_URL = "https://www.caf.fr/allocataires/caf-du-nord/offre-de-service/thematique-libre/les-documents-necessaires-pour-la-demande-d-aide-au-logement"
SOURCE_TITLE = "Les documents nécessaires pour la demande d'aide au logement - CAF"
CATEGORY = "demarche"
TARGET_SECTION_TITLE = "Les documents demandés pour ma demande d'aide au logement"

with open(INPUT_HTML, encoding="utf-8") as f:
    soup = BeautifulSoup(f, "html.parser")

togglers = soup.find_all("a", class_="ckeditor-accordion-toggler")
target_toggler = next(t for t in togglers if t.get_text(strip=True) == TARGET_SECTION_TITLE)

dt = target_toggler.parent
dd = dt.find_next_sibling("dd")
content = " ".join(dd.get_text(separator=" ", strip=True).split())

records = [{
    "id": "documents-caf-section2",
    "question": TARGET_SECTION_TITLE,
    "answer": content,
    "source_url": SOURCE_URL,
    "source_title": SOURCE_TITLE,
    "category": CATEGORY,
}]

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print(f"1 section extraite ({len(content)} car.)\n")
print(content)