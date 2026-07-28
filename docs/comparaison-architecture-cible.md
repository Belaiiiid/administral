# Comparaison : architecture cible vs implémentation réelle

Vérifié en lisant le code (pas les noms de fichiers) : `backend/app/modules/*`,
`requirements.txt`, `main.py`, les modules `ai/fraud`, `ai/coherence`,
`chatbot/rag`, `profiling`.

## Verdict global

Les fondations conceptuelles sont là et souvent bien faites (RAG hybride RRF
correct, garde-fous anti-injection, validation Pydantic stricte, limite de
boucle exacte). Mais l'architecture cible décrit un système **beaucoup plus
vaste** que ce qui existe : un orchestrateur LangGraph unifiant tout le
pipeline, un moteur de calcul APL déterministe, FranceConnect, MinIO chiffré,
une détection de fraude par vision (OpenCV/ELA) en boucle agentique. Rien de
tout cela n'existe. Ce qui existe est une collection de modules FastAPI
séquentiels, chacun avec son propre appel Mistral isolé et sa propre
dégradation gracieuse — solide, mais pas orchestré comme un graphe d'état
unique.

---

## 1. Vue d'ensemble de l'architecture système

| Composant cible | Réalité | Statut |
|---|---|---|
| Frontend Next.js/React, STT/TTS citoyen | React + Vite (pas Next.js, pas de SSR). **Aucun STT/TTS** — `mode_vocal` est un booléen transporté sans jamais déclencher de synthèse ou reconnaissance vocale (vérifié : aucun `SpeechRecognition`/`speechSynthesis` fonctionnel dans le code) | ❌ Manquant (voix) / Partiel (framework) |
| Backend FastAPI/Python | ✅ Exact | ✅ |
| **Orchestrateur LangGraph unique** (state engine reliant profilage→checklist→complétude→cohérence→fraude→notif) | **N'existe pas.** LangGraph est utilisé dans **deux poches isolées et indépendantes** : l'agent de profilage (`modules/profiling/services/agent_graph.py`) et l'orchestrateur du chatbot RAG (`modules/chatbot/rag/orchestrator.py`). Le pipeline checklist → complétude → cohérence → fraude est une **suite d'appels de fonctions Python séquentiels** dans `submission.py`, pas les nœuds d'un même graphe | ❌ Faux — deux graphes isolés, pas un state engine unifié |
| Chatbot RAG parallèle | ✅ Réel et fonctionnel (voir §2), mais **citoyen uniquement** — aucune version agent avec "accès étendu aux 4 sources réglementaires" | Partiel |
| Pipeline OCR (pypdf/pdfplumber déterministe + Vision Engine Pixtral) | ✅ pypdf/pdfplumber réels. OCR via l'API Mistral OCR (`mistral-ocr-latest`) — probablement du Pixtral en interne côté Mistral, mais pas un moteur vision auto-hébergé nommé comme tel | ✅ Équivalent fonctionnel |
| Moteur de détection (ExifTool/PyPDF2 + OpenCV ELA) | **Partiel.** ExifTool : code réel mais **conditionnel** — n'est utilisé que si le binaire est présent sur le PATH système (jamais installé dans cet environnement) ; sinon repli sur un parseur PDF pur Python. **OpenCV/ELA : absent**, zéro dépendance, zéro trace dans le code | ❌ OpenCV absent / ⚠️ ExifTool jamais actif en pratique |
| Mock FranceConnect (SSO) | **Absent.** Aucune trace. Authentification = email/mot de passe classique uniquement | ❌ Manquant |
| Moteur APL déterministe (CAF Engine, calcul du montant) | **Absent.** Aucun calcul de droit APL par barème officiel trouvé nulle part. Le "score" existant (`score_value`/`score_band`, modèle `eligibility-scoring-v2.1`) est un score de priorité/complétude, **pas un montant d'aide chiffré** | ❌ Manquant — écart majeur |
| Mistral API | ✅ Réel, richement utilisé (5 modules indépendants : checklist, classification, cohérence, fraude, génération RAG) | ✅ |
| Qdrant Vector DB | ✅ Réel, RAG hybride fonctionnel | ✅ |
| PostgreSQL | ✅ Réel, 17+ tables, migrations Alembic, journal d'audit chaîné par hash | ✅ |
| MinIO S3 (chiffrement AES) | **Absent.** Stockage sur système de fichiers local, **aucun chiffrement au repos** | ❌ Manquant |

---

## 2. Décomposition technique

### A. Flux fonctionnel — les "2 boucles agentiques"

**Agent de Profilage (Boucle 1)** — ✅ **conforme, vérifié au code exact.**
`LIMITE_TOURS = 12` dans `profiling/services/harness.py` — la limite de 12
itérations annoncée est réellement codée, pas approximative. Le mécanisme
d'évaluation de complétude (`evaluer_completude_profil`) existe et pilote
bien la boucle question/réponse.

**Génération & Complétude** — ✅ **conforme depuis cette session.**
- Génération de checklist : désormais un vrai appel Mistral 1-shot
  (`ai/checklist/`, ajouté cette session), avec repli déterministe.
- Analyse des pièces : extraction texte natif (pypdf/pdfplumber) → OCR Mistral
  si score insuffisant → classification LLM 1-shot → correspondance avec la
  checklist. Ordre exact conforme à la cible.

**Analyse de cohérence & détection de falsification (Boucle 2)** — **Partiel, un point important à corriger.**
- Branche A (vérification par défaut, 1 appel LLM) : ✅ conforme, testée en
  conditions réelles cette session (8 incohérences correctement détectées sur
  un dossier de test).
- Branche B ("Sur alerte" → Agent d'Investigation forensic ExifTool+OpenCV+boucle) :
  **ne correspond pas à ce qui existe.** L'analyse fraude (`ai/fraud/`) :
  - n'est **pas conditionnée** par un signal d'incohérence — elle tourne
    **systématiquement, pour chaque document, à chaque soumission**, en
    parallèle (tâche de fond FastAPI), indépendamment du résultat de la
    cohérence ;
  - n'est **pas une boucle** — un unique appel Mistral (`mistral-large-latest`)
    sur les métadonnées, jamais itéré, jamais de "boucle de correction" ;
  - n'utilise **pas OpenCV/ELA** (analyse de recompression d'image) — inexistant ;
  - ExifTool n'est actif que si le binaire système est présent (jamais le cas ici).

### B. Moteur RAG hybride & Chatbot

✅ **Conforme et vérifié au code, avec précision.** `chatbot/rag/hybrid_search.py`
implémente une vraie fusion RRF (Reciprocal Rank Fusion), formule standard
`Σ 1/(k + rang)` avec `k=60` (référence académique Cormack et al. citée dans
le code lui-même) — exactement la formule de la cible, pas une approximation.

Isolation des rôles citoyen/agent : **partielle.** Le prompt citoyen (vulgarisation,
restreint aux démarches) existe et fonctionne. **Aucun chatbot agent** avec "accès
étendu aux 4 sources réglementaires" n'a été trouvé — un seul routeur chatbot
existe, citoyen uniquement (`/citizen/chatbot/message`).

### C. Services & stockage

| Composant | Rôle cible | Réalité |
|---|---|---|
| FastAPI | Gateway, rate-limiting, JWT, 2 rôles | JWT + 2 rôles (+ ADMIN, donc 3) ✅. **Rate-limiting : absent**, aucune trace trouvée sur les routes d'auth ni ailleurs |
| PostgreSQL | États du graphe, sessions, audit | Sessions de profilage en **mémoire** (TTL 30 min), pas en base — perdues au redémarrage. Audit : ✅ réel et chaîné. TLS : dépend de la configuration PostgreSQL elle-même, non géré applicativement |
| MinIO (S3) | Pièces justificatives, URLs pré-signées, chiffrement au repos | ❌ Système de fichiers local, chemins internes servis via l'API (pas d'URL pré-signée), aucun chiffrement |
| CAF Engine | Calcul déterministe du montant APL, zéro hallucination sur les chiffres | ❌ N'existe pas du tout |

---

## 3. Matrice de sécurité & robustesse

| Mesure cible | Réalité |
|---|---|
| Prompt Guard / sanitization anti-injection | ✅ **Réel et systématique** — chaque prompt envoyé à Mistral (cohérence, classification, fraude) instruit explicitement le modèle à traiter le texte extrait comme donnée non fiable, jamais comme instruction. Vérifié dans les 3 modules |
| Validation stricte des sorties LLM (Pydantic) | ✅ **Réel et systématique** — chaque réponse JSON de Mistral est normalisée/validée, tout champ hors énumération ou confiance hors plage est ramené à une valeur sûre (`a_revoir`/`insufficient`), jamais propagé tel quel |
| Traçabilité accès agent (RGPD) | ⚠️ **Partiel.** Les **actions** (décision, soumission, contestation) sont auditées avec précision (qui, quand, quoi). La simple **consultation en lecture** d'un dossier par un agent n'est PAS journalisée — seul un changement d'état l'est. "Pièces consultées" par un agent qui ne fait que regarder n'est pas tracé |
| Chiffrement TLS | Dépend du déploiement (nginx/reverse proxy), pas géré par l'application elle-même |

---

## 4. Stratégie d'optimisation coûts / carbone

| Principe cible | Réalité |
|---|---|
| Déterminisme first (0 % LLM sur calcul APL, dates, métadonnées PDF) | Dates/métadonnées PDF : ✅ déterministe (pypdf/pdfplumber/parseur Python). **Calcul APL** : sans objet, puisqu'aucun moteur de calcul n'existe |
| OCR ciblé (Pixtral seulement si extraction native échoue) | ✅ **Conforme, vérifié au code exact** — `_NATIVE_MIN_CHARS = 40` : l'OCR Mistral n'est appelé que si l'extraction PDF native renvoie moins de 40 caractères. Logique de seuil réelle, pas une déclaration d'intention |
| Hébergement souverain (Mistral, datacenters français) | Dépend du choix de compte/région Mistral côté utilisateur — rien dans le code ne force ni ne vérifie une région d'hébergement |

---

## Tableau récapitulatif

| Élément de l'architecture cible | Statut | Écart principal |
|---|---|---|
| Orchestrateur LangGraph unique | ❌ Faux | 2 graphes isolés (profilage, RAG chatbot) ; le reste du pipeline est séquentiel, pas un state engine |
| Agent de profilage (boucle, max 12) | ✅ Conforme | Aucun — vérifié exact |
| Génération checklist LLM | ✅ Conforme | Ajouté cette session, avec repli déterministe |
| Complétude déterministe | ✅ Conforme | Aucun |
| Cohérence (1 appel LLM) | ✅ Conforme | Testé en réel |
| Agent fraude/investigation (boucle, ExifTool+OpenCV) | ❌ Partiel/Faux | Pas de boucle, pas conditionné par une alerte, pas d'OpenCV, ExifTool jamais actif |
| RAG hybride BM25+Qdrant+RRF | ✅ Conforme | Formule RRF exacte et correcte |
| Chatbot agent (rôle étendu) | ❌ Manquant | Un seul chatbot, citoyen uniquement |
| FastAPI + JWT + rôles | ✅ Conforme (3 rôles, pas 2) | Pas de rate-limiting |
| PostgreSQL + audit | ✅ Conforme | Sessions profilage en mémoire, pas en base ; audit = actions, pas consultations |
| MinIO S3 + chiffrement | ❌ Manquant | Fichiers en clair sur disque local |
| Mock FranceConnect | ❌ Manquant | Aucune trace |
| Moteur de calcul APL déterministe | ❌ Manquant | Écart le plus important — aucun calcul de montant d'aide |
| Prompt Guard anti-injection | ✅ Conforme | Systématique sur tous les modules LLM |
| Validation Pydantic stricte | ✅ Conforme | Systématique |
| OCR ciblé (seuil de confiance) | ✅ Conforme | Seuil exact vérifié (40 caractères) |
