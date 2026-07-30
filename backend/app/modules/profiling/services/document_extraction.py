from __future__ import annotations

import json
import logging
import time

import httpx

from app.core.config import settings
from app.modules.profiling.schemas.profil import ProfilPartiel, CHAMPS_PROFILAGE

logger = logging.getLogger("apl.document_extraction")

MISTRAL_API_KEY = (settings.mistral_api_key or "").strip() or None
MISTRAL_MODEL = settings.mistral_model
MISTRAL_API_URL = settings.mistral_api_url

SYSTEM_PROMPT_EXTRACTION = """Tu es un expert administratif spécialisé dans l'analyse de documents justificatifs (quittances de loyer, certificats de scolarité, fiches de paie, avis d'imposition, etc.).
Ton objectif est d'extraire toutes les informations pertinentes du texte fourni pour pré-remplir un profil de demandeur d'Aide Personnalisée au Logement (APL).

Voici les informations partielles que nous avons déjà sur l'utilisateur :
{profil_existant}

Tu dois analyser le document fourni et extraire un maximum de valeurs correspondant aux champs suivants :
{champs_possibles}

INSTRUCTIONS STRICTES :
1. N'écrase jamais une valeur qui est déjà présente dans le profil existant, sauf si le document apporte une preuve flagrante d'une erreur ou d'une mise à jour (ex: le profil indique "étudiant" mais le document est un CDI récent). En cas de doute, garde la valeur existante.
2. Ton format de sortie doit obligatoirement être un objet JSON valide, où les clés sont les noms des champs extraits et les valeurs sont les valeurs extraites.
3. Pour les champs énumérés (ex: statut_professionnel, situation_logement, statut_marital, type_location), utilise EXACTEMENT les valeurs autorisées.
4. Pour les montants (ex: loyer_mensuel, revenus_nets_mensuels, surface_m2), utilise des nombres décimaux ou entiers, pas de texte.
5. Ne renvoie que les champs que tu as pu trouver dans le document. Ne renvoie pas de valeurs `null` pour les champs non trouvés.
6. SOIS TRÈS ATTENTIF à l'identité du demandeur (champs `nom`, `prenom`, `email`). Assure-toi d'extraire l'identité du citoyen demandeur et non celle du bailleur, du gestionnaire ou de l'employeur.
7. DÉDUCTIONS LOGIQUES ET SYNONYMES : 
   - Un certificat de scolarité, une carte d'étudiant ou le mot "étudiant" implique statut_professionnel="etudiant".
   - Un bail, attestation d'hébergement ou quittance implique situation_logement="locataire".
   - Un contrat de travail ou fiche de paie implique statut_professionnel="salarie".
   - Recherche les montants associés au "loyer", "loyer de base", ou "montant principal" -> loyer_mensuel.
   - Si tu vois une adresse complète (rue, code postal, ville), sépare-la dans les champs adresse, code_postal, ville.
   - "Célibataire", "seul" -> statut_marital="celibataire".
8. Sois agressif dans l'extraction : si une information semble correspondre à un champ, mets-la. 

Valeurs autorisées pour les énumérations :
- statut_professionnel : etudiant, apprenti_alternant, salarie, demandeur_emploi, independant
- situation_logement : locataire, proprietaire, heberge
- type_location : vide, meublee, colocation, chambre, sous_location, residence_etudiante
- statut_marital : celibataire, marie, pacse, concubinage

Exemple de sortie attendue :
{{
  "nom": "Dupont",
  "prenom": "Jean",
  "email": "jean.dupont@gmail.com",
  "situation_logement": "locataire",
  "loyer_mensuel": 450.50,
  "surface_m2": 25.0,
  "adresse": "12 rue des Fleurs",
  "code_postal": "75001",
  "ville": "Paris",
  "statut_professionnel": "etudiant",
  "moins_de_30_ans": true
}}

Document à analyser :
{texte_document}
"""

class ExtractionError(Exception):
    pass

async def _ocr_image_via_pixtral(image_bytes: bytes, mime_type: str) -> str:
    import base64
    if not MISTRAL_API_KEY:
        raise ExtractionError("Clé Mistral manquante pour l'OCR d'image.")
        
    b64_image = base64.b64encode(image_bytes).decode('utf-8')
    image_url = f"data:{mime_type};base64,{b64_image}"

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Transcris tout le texte présent sur ce document de manière précise. Ne résume pas, fournis uniquement le texte extrait."
                },
                {
                    "type": "image_url",
                    "image_url": image_url
                }
            ]
        }
    ]

    payload = {
        "model": "pixtral-12b-2409",
        "messages": messages,
        "temperature": 0.1,
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                MISTRAL_API_URL,
                headers={
                    "Authorization": f"Bearer {MISTRAL_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.HTTPError as exc:
        logger.error("Erreur réseau OCR Pixtral: %s", exc)
        raise ExtractionError(f"Erreur API Mistral (Pixtral): {exc}") from exc

    if resp.status_code >= 400:
        logger.error("Erreur HTTP OCR Pixtral %d: %s", resp.status_code, resp.text[:300])
        raise ExtractionError(f"Erreur OCR Mistral Pixtral {resp.status_code}")

    data = resp.json()
    return data["choices"][0]["message"]["content"]


async def extraire_profil_depuis_document(texte: str, profil_actuel: ProfilPartiel) -> dict:
    if not MISTRAL_API_KEY:
        logger.warning("Clé Mistral manquante. Impossible d'extraire les données du document.")
        return {}

    profil_existant_json = profil_actuel.model_dump(exclude_none=True, mode="json")
    
    prompt = SYSTEM_PROMPT_EXTRACTION.format(
        profil_existant=json.dumps(profil_existant_json, ensure_ascii=False, indent=2),
        champs_possibles=", ".join(CHAMPS_PROFILAGE),
        texte_document=texte
    )

    messages = [
        {"role": "user", "content": prompt},
    ]

    payload = {
        "model": MISTRAL_MODEL,
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }

    logger.info("→ Appel Mistral pour extraction document | texte_length=%d", len(texte))

    debut = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                MISTRAL_API_URL,
                headers={
                    "Authorization": f"Bearer {MISTRAL_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.HTTPError as exc:
        logger.error("✗ Mistral inatteignable (extraction) après %.0f ms : %s", (time.perf_counter() - debut) * 1000, exc)
        raise ExtractionError(f"Erreur API Mistral: {exc}") from exc

    if resp.status_code >= 400:
        logger.error("✗ Mistral HTTP %d (extraction) : %s", resp.status_code, resp.text[:300])
        raise ExtractionError(f"Erreur API Mistral {resp.status_code}")

    data = resp.json()
    contenu_brut = data["choices"][0]["message"]["content"]
    
    try:
        donnees_extraites = json.loads(contenu_brut)
        logger.info("← Mistral OK (extraction) | %d clés extraites", len(donnees_extraites))
        # Filtrer pour ne garder que les champs valides
        valides = {k: v for k, v in donnees_extraites.items() if k in CHAMPS_PROFILAGE}
        return valides
    except json.JSONDecodeError as exc:
        logger.error("Erreur de parsing JSON pour l'extraction : %s", contenu_brut)
        raise ExtractionError("La réponse du LLM n'est pas un JSON valide.") from exc
