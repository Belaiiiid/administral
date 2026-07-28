# Audit du scénario E2E `flux_test_e2e_apl_caf.md` face au code réel

Réalisé en lisant le comportement effectif du backend (`backend/app/**`), du
frontend (`frontend/src/**`), le schéma de base (migrations Alembic +
modèles SQLAlchemy) et en cherchant toute trace de n8n/MinIO dans le repo.

## Constat d'architecture préalable (à lire avant le détail par étape)

Le scénario de test suppose une architecture **n8n + MinIO/S3** orchestrant
des appels Mistral. Ce n'est pas ce qui existe dans ce repo :

- **Aucun n8n** : ni fichier de workflow, ni docker-compose, ni webhook. Tous
  les appels Mistral sont des appels HTTP directs (`httpx.post`) faits
  **depuis le backend FastAPI lui-même** (`modules/ai/coherence/mistral_client.py`,
  `modules/citizen/classification.py`, `modules/citizen/extraction.py`,
  `modules/ai/fraud/llm_analyzer.py`). Il n'y a pas de risque de "timeout
  webhook n8n" pour la bonne raison qu'il n'y a pas de webhook n8n — mais le
  risque de timeout existe quand même, sur les appels HTTP directs (vu en
  pratique : cohérence, 60 s, déjà atteint une fois dans cette session).
- **Aucun MinIO/S3** : le stockage des fichiers est un simple système de
  fichiers local (`modules/citizen/storage.py`, `Path.write_bytes`). Pas de
  chiffrement SSE-S3/KMS, pas d'object storage.
- **La génération de checklist n'est PAS un appel Mistral.** C'est un module
  Python pur, déterministe, à base de règles (`checklist_rules.py`). Le code
  le documente lui-même explicitement : *"The LLM does not decide required
  documents... Given the same profile it always returns the same checklist."*
  Le nœud "B1 génération LLM" mentionné dans les commentaires est un nœud
  **prévu mais jamais câblé** — la liste actuelle en est le remplaçant
  transparent et auditable.

Ces trois points ne sont pas des bugs — ce sont des choix d'architecture
documentés dans le code — mais ils invalident une partie des hypothèses du
scénario de test tel qu'écrit.

---

## Étape 0 — Authentification (JWT)

**Statut : Partiel.**
Fichiers : `modules/auth/{router,service,security,dependencies,schemas}.py`.

| Point à vérifier | Résultat |
|---|---|
| Signup existe, hash le mot de passe | ✅ `POST /auth/register`, bcrypt direct (`security.hash_password`), jamais de mot de passe en clair stocké ni sérialisé |
| Login retourne access **+ refresh** token | ❌ **Pas de refresh token.** `TokenResponse` ne porte que `access_token` (`schemas.py:90-95`). JWT stateless, expiration 30 min fixe (`access_token_expire_minutes`). Un utilisateur doit se reconnecter après expiration — assumé et documenté dans le code (`security.py` : "No refresh token yet") |
| Middleware bloque les routes protégées sans token | ✅ `HTTPBearer(auto_error=True)` + `get_current_user` — 401 propre si absent/invalide/expiré |
| Rôle vérifié (citoyen ne peut pas appeler une route agent) | ✅ `require_role()` (`dependencies.py:78-97`) compare `current_user.role`, 403 sinon. Le rôle est relu en base à **chaque requête** (pas seulement dans le JWT), donc un changement de rôle prend effet immédiatement, pas seulement à l'expiration du token |
| Expiration gérée (refresh fonctionne) | ❌ N/A — pas de refresh à tester puisqu'il n'existe pas |

**Bonus vérifié** : mot de passe ≥ 8 caractères imposé côté serveur (Pydantic, `schemas.py:29`), pas seulement frontend.

---

## Étape 1 — Création du profil / situation

**Statut : Implémenté**, mais pas sous la forme "DOSSIER + statut brouillon" attendue.
Fichiers : `modules/citizen/profile.py`, `features/citizen/profiling/schemas/profil.py`.

- Il n'y a pas de table `DOSSIER` avec un statut `brouillon`. Le profil vit sur
  `citizens.profile_data` (JSONB), et le "dossier de travail" est une
  `Application` (statut `incomplete`/`complete` uniquement — pas de notion de
  brouillon distincte).
- **Validation champs obligatoires côté backend** : ✅ réelle. `ProfilPartiel`/`ProfilPatch`
  sont des schémas Pydantic validés à chaque écriture (`profile.py:163-172`,
  ré-instanciés via `ProfilPartiel.model_validate`) — un profil invalide ne peut pas
  entrer en base même si le frontend le laissait passer.
- **Plusieurs dossiers en parallèle** : ⚠️ **Ambigu, non tranché.** `get_application_by_citizen`
  prend "le plus récent" (`ORDER BY created_at DESC`) s'il en existe plusieurs — rien
  n'empêche la création de plusieurs `Application` pour un même citoyen, mais rien ne les
  fusionne non plus : un doublon devient silencieusement invisible plutôt que rejeté ou
  fusionné. Ce n'est pas bloquant en usage normal (une seule est créée par citoyen dans le
  flux actuel), mais ce n'est pas une garantie du schéma.

---

## Étape 2 — Génération de la checklist

**Statut : Implémenté, mais PAS via Mistral.**
Fichier : `modules/citizen/checklist_rules.py` (`generate_personalized_checklist`).

| Point à vérifier | Résultat |
|---|---|
| Le prompt Mistral couvre tous les cas (étudiant, salarié, indépendant, couple, colocation…) | ❌ **Il n'y a pas de prompt.** C'est un arbre de règles Python pur (if/elif sur `StatutLogement`, `StatutProfessionnel`, `StatutMarital`…). Les cas couverts : locataire (dont résidence étudiante, sous-location), propriétaire, hébergé ; salarié, apprenti/alternant, étudiant (boursier ou non), demandeur d'emploi (ARE ou non), indépendant ; marié/pacsé, enfants à charge, pension alimentaire, conjoint. La colocation en tant que telle n'a **pas** de branche dédiée (traitée implicitement comme locataire standard) |
| Comportement si l'appel Mistral échoue/timeout | ❌ N/A — aucun appel Mistral à cette étape, donc aucun risque de timeout ici. (Le vrai risque de timeout Mistral existe ailleurs : cohérence, classification, fraude, OCR — tous testés et confirmés à 30-60 s de timeout avec dégradation propre) |
| Temps de réponse / risque timeout webhook n8n | ❌ N/A — pas de n8n, exécution synchrone en mémoire, quasi instantanée |

**Point positif** : chaque item porte sa `justification` ("Parce que vous êtes locataire…"), donc le rapport citoyen est explicable par construction — pas une boîte noire LLM.

---

## Étape 3 — Upload des documents

**Statut : Implémenté**, avec des limites précises.
Fichiers : `modules/citizen/{router,service,storage}.py`.

| Point à vérifier | Résultat |
|---|---|
| Formats acceptés et taille max | ✅ PDF, JPG, PNG uniquement (whitelist stricte des deux côtés : MIME dans `service.py` et suffixe sur disque dans `storage.py`). **❌ Pas de HEIC.** Taille max 10 Mo (`settings.max_upload_bytes`), vérifiée avant traitement |
| CORS frontend ↔ backend | ✅ `CORSMiddleware` configuré avec origines explicites (`CORS_ORIGINS` env), `allow_credentials=True` — pas de wildcard `*`, cohérent avec l'usage de cookies/Authorization à venir |
| Fichier chiffré (SSE-S3/KMS) | ❌ **Aucun chiffrement.** Écriture en clair sur disque local (`Path.write_bytes`). Pas de MinIO/S3 du tout |
| Upload interrompu → fichier partiel | ✅ Non-problème par construction : le backend lit **tout** le fichier en mémoire (`await file.read()`) avant d'appeler `storage.store()` — si la connexion tombe pendant la lecture, l'exception se produit avant l'écriture disque ; aucun fichier partiel n'est jamais écrit |

**Point ajouté cette session** (hors scénario, mais directement lié) : déduplication par hash SHA-256 du contenu — un fichier identique déjà déposé sur le même dossier est refusé avec un message clair plutôt que dupliqué.

---

## Étape 4 — OCR + lisibilité (Mistral OCR)

**Statut : Implémenté**, avec une nuance importante sur "illisible".
Fichier : `modules/citizen/extraction.py`.

| Point à vérifier | Résultat |
|---|---|
| Scan flou/mauvaise qualité → détecté illisible, pas mal interprété | ⚠️ **Partiellement.** Il n'y a pas de statut `illisible` explicite au niveau du document — l'extraction renvoie simplement un texte vide ou court, et c'est la **classification** en aval qui, faute de texte exploitable, renvoie `insufficient` ("Aucun texte exploitable n'a pu être extrait"). Le document lui-même reste `status: validated` (il a bien été reçu et traité) même si son contenu n'a rien donné — la distinction "reçu" vs "lisible" n'est portée que par `classification.decision`, pas par un champ dédié |
| PDF recto-verso / multi-pages en un fichier | ✅ Géré nativement : `pdfplumber` extrait le texte de **toutes les pages** et les concatène (`_extract_native_pdf`, `page.extract_text()` sur chaque page) |
| Délai / risque timeout (appels séquentiels) | ✅ Vérifié en conditions réelles cette session : upload synchrone, un appel Mistral OCR par document (fallback si PDF texte natif < 40 caractères), **pas de traitement par lot** — chaque upload attend son propre OCR avant de répondre. Pour N documents déposés d'affilée, c'est N appels séquentiels bloquants côté citoyen (pas de file d'attente asynchrone) |

---

## Étape 5 — Vérification de complétude

**Statut : Implémenté.**
Fichier : `modules/citizen/service.py` (`upload_document`, `_recompute_status`), `classification.py`.

| Point à vérifier | Résultat |
|---|---|
| Un document peut-il couvrir plusieurs items checklist ? | ❌ **Non — un seul match par document.** `Classification.matched_checklist_document_id` est un champ singulier ; un document ne peut flipper qu'**un seul** item de la checklist, jamais deux, même si son contenu justifierait les deux |
| Notification claire sur ce qu'il manque | ✅ La checklist (`GET /citizen/dossier`) renvoie chaque item avec son statut et sa raison ; le frontend affiche "X/Y pièces obligatoires" + liste des manquantes en vert/neutre |

---

## Étape 6 — Analyse de cohérence (Mistral LLM)

**Statut : Implémenté et réellement testé cette session** (y compris son mode d'échec).
Fichiers : `modules/ai/coherence/{mistral_client,service}.py`, `modules/citizen/submission.py`.

| Point à vérifier | Résultat |
|---|---|
| Incohérence volontaire détectée | Non testé avec un vrai cas contradictoire dans cette session, mais le mécanisme est réel : un seul appel Mistral reçoit *tout* le profil déclaré + *tout* le texte extrait des documents, avec un prompt qui liste explicitement les champs à comparer (identité, adresse, loyer, revenus, dates…) et renvoie un statut par champ |
| Pas de faux positif si tout est cohérent | Le prompt impose `a_revoir` par défaut en cas de doute (jamais `coherent` par défaut) — direction de repli délibérément prudente |
| Niveau de gravité calculé ou arbitraire ? | ✅ **Calculé, pas arbitraire.** `incoherent` → `error`, `a_revoir` → `incoherent` → `warning` (`submission.py:223-226`). Score global = `completion_rate - 25×erreurs - 10×avertissements`, borné 0-100. **Vérifié en conditions réelles cette session** : un vrai timeout Mistral (60 s dépassées) a produit exactement le comportement documenté — dégradation en `a_revoir` avec le message d'erreur brut exposé au citoyen ("Vérification LLM impossible : The read operation timed out"), jamais un crash |
| ⚠️ Point non prévu au scénario | Le calcul ne tourne **qu'une fois, à la soumission**, et le résultat est figé sur le `Case`. Une resoumission du même dossier est idempotente et renvoie le résultat déjà stocké **sans jamais relancer l'analyse** — donc un timeout ponctuel reste affiché indéfiniment tant que personne ne déclenche un recalcul manuel. Ça rejoint directement l'étape 9 (pas de retraitement partiel/relance) |

---

## Étape 7 — Rapport citoyen

**Statut : Implémenté, mais pas de "RAPPORT_ANALYSE" séparé.**
Fichier : `modules/citizen/submission.py` (`DossierReviewResponse`), affiché dans `PersonalizedDossierPage.tsx`.

- Pas d'entité dédiée : le rapport, c'est la combinaison `completeness_report` + `coherence_report` + `decision`, lus ensemble sur une seule vue.
- **Compréhensible pour un non-initié** : ⚠️ mitigé. Les messages sont en français clair pour les cas normaux ("Le loyer déclaré diffère du montant lu sur le contrat de location"), mais le mode dégradé expose le message d'erreur technique brut de la librairie HTTP au citoyen (vu cette session : "The read operation timed out" affiché tel quel) — ce n'est pas traduit en langage utilisateur.
- **Correction/re-upload depuis le rapport** : ✅ oui, sur la même page (restructurée cette session) — dépôt de documents et checklist sont sur la même interface que le rapport de cohérence.

---

## Étape 8 — Chat + assistance vocale

**Statut : Partiel — chat oui, voix non.**
Fichiers : `features/citizen/chatbot/{router,service}.py`, `store/uiStore.ts`.

| Point à vérifier | Résultat |
|---|---|
| Accès au contexte du dossier en cours | ✅ Réel. Le routeur d'intention distingue `rag_general` (RAG générique avec citations), `depot_dossier` (reconnecté à `submission.get_dossier_review` + `citizen_service.get_checklist` — répond sur *le* dossier réel du citoyen connecté), `autre_profil` |
| Assistance vocale fonctionnelle | ❌ **N'existe pas.** `mode_vocal` est un simple booléen transporté de bout en bout (session de profilage, préférences frontend `voiceAssistant`/`voiceInput`/`speechSynthesis`) — **aucun appel `SpeechRecognition` ni `speechSynthesis` trouvé dans le code**, aucun endpoint STT/TTS côté backend. C'est un drapeau prévu pour un futur nœud "A1", jamais câblé |
| Historique conservé et consultable | ❌ **Non persisté.** `conversation_history` est envoyé par le frontend à chaque requête et jamais écrit en base côté serveur — un rechargement de page perd tout l'historique. (Déjà identifié et proposé comme extension `chatbot_conversations`/`chatbot_messages` dans `docs/schema-bdd.md`, non implémenté) |

---

## Étape 9 — Renvoi / correction

**Statut : Partiel.**

- **Checklist** : ✅ retraitement réellement partiel et pas cher — `dossier.sync_checklist` ne touche que les items qui changent, appelé de façon idempotente à chaque lecture.
- **Cohérence/complétude après soumission** : ❌ **Pas de retraitement du tout**, partiel ou complet. Comme noté à l'étape 6, une resoumission renvoie le résultat existant sans jamais relancer l'analyse — donc "corriger un document et relancer la vérification" n'a **aucun effet visible** une fois le dossier soumis. C'est le manque le plus concret par rapport au scénario testé.

---

## Étape 10 — `pret_a_envoyer` → `envoye`

**Statut : Implémenté, avec des noms de statuts différents du scénario.**
Fichier : `modules/citizen/submission.py`, `modules/agent/models.py`.

- Statuts réels (`CaseStatus`) : `submitted`, `awaiting_documents`, `under_review`,
  `ready_for_decision`, `validated`, `rejected` — pas de `brouillon`/`en_verification`/
  `pret_a_envoyer`/`envoye`/`en_traitement_caf`/`traite` littéraux. La sémantique est
  proche mais pas isomorphe (mapping possible, migration de vocabulaire à faire si
  besoin de coller au scénario).
- **`HISTORIQUE_STATUT`** : n'existe pas comme table dédiée ; remplacé par `audit_events`
  (générique, chaîné par hash, couvre bien plus que les transitions de statut).
- **Assignation d'un agent au dossier** : ❌ **N'existe pas du tout.** Vérifié : aucune
  colonne, aucune logique dans `modules/agent/*`. Le modèle est une **file partagée** —
  tous les agents voient tous les dossiers non décidés (`UNDECIDED_STATUSES`), documenté
  explicitement dans le code ("no per-case assignment in the model, so 'a new dossier to
  instruct' is news to all of them"). C'est une règle métier à définir, comme le
  scénario le pressent.

---

## Étape 11 — Côté agent CAF

**Statut : Partiel.**
Fichier : `modules/agent/{router,service,repository}.py`.

| Point à vérifier | Résultat |
|---|---|
| Un agent ne voit que ses dossiers assignés | ❌ **Faux par conception** — confirmé au code : `list_cases`/`find_case_summaries` n'a **aucun filtre sur l'identité de l'agent**. Tout agent authentifié voit tous les dossiers de la file, quel que soit qui l'a déjà ouvert ou instruit. Ce n'est pas une fuite de rôle (un agent ne voit pas les dossiers d'un *citoyen* qu'il ne devrait pas voir), mais l'isolation *entre agents* que le scénario suppose n'existe pas |
| Signaux de fraude réellement détectés ou placeholder | ✅ **Réel, vérifié au code.** `run_fraud_analysis` tourne en tâche de fond FastAPI (`BackgroundTasks`) juste après la soumission — métadonnées déterministes + verdict Mistral optionnel (`mistral-large-latest`), écrit sur `CaseDocument.fraud_analysis`/`fraud_risk`. **Point non couvert par le scénario mais trouvé en lisant le code** : cette tâche de fond n'est ni journalisée comme "en attente" ni retentée — si le process backend redémarre entre la réponse de soumission et la fin de l'analyse, le résultat est perdu silencieusement, sans ré-exécution possible autrement qu'en resoumettant (ce qui, comme vu à l'étape 6/9, ne relance rien pour un dossier déjà soumis) |

---

## Étape 12 — Décision de l'agent

**Statut : Implémenté, vérifié réellement (pas de n8n, pas manuel).**
Fichier : `modules/agent/service.py` (`decide_case`).

- ✅ Existe en tant qu'endpoint FastAPI réel (`POST /agent/cases/{id}/decision`), pas un
  processus manuel ni un nœud n8n. Séquence vérifiée au code : extraction de preuves
  → refus explicite d'un rejet sans preuve vérifiable → génération d'explication à partir
  des preuves uniquement (jamais de texte halluciné) → écriture atomique décision + audit
  → notification citoyen (best-effort, e-mail si opt-in).
- `HISTORIQUE_STATUT` : couvert par `audit_events` (`decision_recorded`), pas une table séparée.

---

## Étape 13 — Côté admin

**Statut : Absent (au sens du scénario).**

- Il existe des capacités "admin" réelles : provisionnement de comptes agent/admin
  (`POST /auth/staff`), et consultation du **journal d'audit brut** (`GET /audit/recent`,
  `GET /audit/verify` — intégrité de la chaîne de hash).
- **Mais aucun tableau de bord ou endpoint de reporting agrégé** (nombre de dossiers
  traités, temps moyen de traitement, taux d'anomalies) n'existe. Le seul endpoint de
  statistiques (`GET /agent/cases/stats`) est scopé à la file d'instruction courante
  (pending / à traiter aujourd'hui / citoyens suivis), pas à des KPIs historiques globaux.
  **À construire entièrement.**

---

## Failles / manques identifiés hors du scénario de test

1. **Pas de refresh token** — reconnexion obligatoire toutes les 30 min. Assumé par le code mais absent du scénario de sécurité attendu par l'utilisateur.
2. **Aucun chiffrement au repos des fichiers** — stockage local en clair, aucune protection si le disque/serveur est compromis. Sensible pour des pièces d'identité, avis d'imposition, etc.
3. **Tâche de fond fraude non durable** — `BackgroundTasks` de FastAPI n'a ni file, ni retry, ni trace de "en attente" ; un redémarrage serveur au mauvais moment perd l'analyse silencieusement.
4. **Aucune isolation agent↔dossier** — file partagée par design ; si le produit veut un jour "mes dossiers" par agent, c'est une fonctionnalité à construire de zéro (pas juste un filtre à ajouter).
5. **Cohérence/complétude non re-calculables après soumission** — un timeout ou une erreur transitoire reste affiché en base indéfiniment ; pas de bouton "relancer l'analyse" ni de tâche planifiée de retry.
6. **Message d'erreur technique brut exposé au citoyen** en cas d'échec LLM (cohérence) — fuite d'un détail d'implémentation (`httpx` timeout) dans une interface citoyenne.
7. **Pas de limite de débit (rate limiting)** constatée sur les endpoints d'auth (`/auth/login`, `/auth/register`) — pas vérifié en profondeur mais aucune trace de throttling trouvée dans `main.py` ou les routers ; à confirmer si une attaque par force brute est une préoccupation.
8. **Application "brouillon" dupliquable silencieusement** (étape 1) — pas de contrainte d'unicité, comportement par ordre de création plutôt que par règle explicite.

---

## Tableau récapitulatif

| Étape | Statut | Ce qui manque exactement | Priorité |
|---|---|---|---|
| 0 — Auth JWT | Partiel | Pas de refresh token (reconnexion à chaque expiration, 30 min) | Moyenne |
| 1 — Création profil | Partiel | Pas de statut "brouillon" formel ; doublons d'`Application` non empêchés | Basse |
| 2 — Checklist | Partiel | Pas de Mistral du tout — règles déterministes (documenté comme choix, pas un bug) ; colocation non distinguée | Basse |
| 3 — Upload documents | Partiel | Pas de HEIC ; pas de chiffrement au repos ; pas de MinIO/S3 | Haute (chiffrement) / Basse (HEIC) |
| 4 — OCR/lisibilité | Partiel | Pas de statut "illisible" dédié (seulement via classification) | Basse |
| 5 — Complétude | Partiel | Un document = un seul item checklist max | Basse |
| 6 — Cohérence | OK (dégradation testée en réel) | Pas de retraitement après un échec transitoire (timeout figé définitivement) | **Haute** |
| 7 — Rapport citoyen | Partiel | Message d'erreur technique brut exposé au citoyen en cas d'échec LLM | Moyenne |
| 8 — Chat + voix | Partiel | Historique non persisté ; **assistance vocale totalement absente** (drapeau sans implémentation) | Moyenne (historique) / Haute si la voix est un engagement produit |
| 9 — Renvoi/correction | Manquant (post-soumission) | Aucun mécanisme de relance de l'analyse cohérence/complétude après soumission | **Haute** |
| 10 — Envoi CAF | Partiel | Pas d'assignation agent↔dossier ; noms de statuts différents du scénario | Moyenne |
| 11 — Vue agent | Partiel | Aucune isolation entre agents (file partagée) ; tâche fraude non durable | Moyenne |
| 12 — Décision agent | OK | — | — |
| 13 — Vue admin | **Manquant** | Aucun dashboard/reporting agrégé — à construire entièrement | Moyenne |
