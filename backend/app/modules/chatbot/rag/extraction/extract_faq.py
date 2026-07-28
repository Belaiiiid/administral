import json
import copy
from bs4 import BeautifulSoup

SOURCE_URL = "https://www.service-public.fr/particuliers/vosdroits/F12006"
CATEGORY = "demarche"
PREFERRED_SUBTAB = "locataire"  # profil retenu quand un sous-questionnaire existe
OUTPUT_FILE = "apl_caf_faq.json"
INPUT_HTML = "apl.html"  # extrait de https://www.service-public.fr/particuliers/vosdroits/F12006

with open(INPUT_HTML, encoding="utf-8") as f:
    soup = BeautifulSoup(f, "html.parser")

caf_container = soup.find(id="tab-content-situation1")
btns = caf_container.find_all("button", class_="fr-accordion__btn")
# l'infographie "10 questions clés" est traitée séparément (extract_infographie.py)
# car sa structure interne nécessite un parsing dédié, pas un découpage générique
INFOGRAPHIE_PANEL_ID = "accordion-chapter-chapitre11-situation1"
btns = [b for b in btns if b.get("aria-controls") != INFOGRAPHIE_PANEL_ID]

def clean_panel_text(panel):
    """Retourne le texte du panel en ne gardant que le sous-onglet préféré
    s'il existe des sous-onglets imbriqués (ex: Locataire / Résident)."""
    panel = copy.copy(panel)  # ne pas modifier l'arbre original
    nested_tabs = panel.find_all("button", attrs={"role": "tab"})
    if nested_tabs:
        keep_panel_id = None
        for t in nested_tabs:
            if PREFERRED_SUBTAB in t.get_text(strip=True).lower():
                keep_panel_id = t.get("aria-controls")
                break
        if keep_panel_id is None:
            keep_panel_id = nested_tabs[0].get("aria-controls")
        for t in nested_tabs:
            other_id = t.get("aria-controls")
            if other_id and other_id != keep_panel_id:
                other_panel = panel.find(id=other_id)
                if other_panel:
                    other_panel.decompose()
        tablist = panel.find(attrs={"role": "tablist"})
        if tablist:
            tablist.decompose()
    text = panel.get_text(separator=" ", strip=True)
    return " ".join(text.split())

records = []
for b in btns:
    question = b.get_text(strip=True)
    panel_id = b.get("aria-controls")
    panel = soup.find(id=panel_id)
    if not panel:
        continue
    answer = clean_panel_text(panel)
    if not answer:
        continue
    records.append({
        "id": panel_id,
        "question": question,
        "answer": answer,
        "source_url": SOURCE_URL,
        "source_title": "Aide personnalisée au logement (APL) - Service-Public.fr (Caf)",
        "category": CATEGORY
    })

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print(f"{len(records)} paires question/réponse extraites\n")
for r in records:
    print(f"- {r['question']}  ({len(r['answer'])} car.)")