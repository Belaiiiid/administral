# Roadmap par squad — écarts identifiés vs architecture cible

Basé sur `docs/comparaison-architecture-cible.md` (hors point MinIO, exclu à la
demande). Chaque tâche part d'un écart réellement vérifié au code, pas d'une
supposition.

---

## 🔵 SQUAD A — Profilage, Vocal & Calcul APL

| # | Tâche | Écart constaté | Priorité |
|---|---|---|---|
| A1 | **Assistant vocal (STT/TTS)** | `mode_vocal` est aujourd'hui un simple booléen transporté de bout en bout (session, préférences UI) — aucune reconnaissance ni synthèse vocale réelle nulle part dans le code | Haute si engagement produit |
| A2 | **Moteur de calcul APL déterministe (CAF Engine)** | Aucun calcul de montant d'aide par barème officiel n'existe. Le "score" actuel (`score_value`/`score_band`) est un score de priorité/complétude, pas un droit chiffré. **C'est l'écart le plus important de toute la comparaison** | **Haute** |
| A3 | **Persistance des sessions de profilage** | Sessions en mémoire process (TTL 30 min) — perdues à chaque redémarrage serveur, incompatible avec plusieurs instances backend | Moyenne |
| A4 | **Mock FranceConnect (SSO)** | Aucune trace dans le code ; permettrait de pré-remplir l'identité déclarée en Boucle 1 | Basse (dépend d'un accès sandbox FranceConnect) |

*Déjà conforme, rien à faire* : la boucle de profilage elle-même (limite de 12 tours, évaluation de complétude) est vérifiée exacte au code.

---

## 🟡 SQUAD B — Complétude & Pipeline Documentaire

| # | Tâche | Écart constaté | Priorité |
|---|---|---|---|
| B1 | **Un document → plusieurs items de checklist** | La classification ne permet qu'une seule correspondance par document (`matched_checklist_document_id` singulier) — une pièce qui couvrirait deux justificatifs n'en valide qu'un | Basse |
| B2 | **Support HEIC** | Formats acceptés limités à PDF/JPG/PNG (whitelist stricte des deux côtés, backend et stockage) | Basse |
| B3 | **Traitement asynchrone/par lot des uploads** | Chaque dépôt déclenche un appel OCR/classification synchrone et bloquant ; pas de file d'attente si plusieurs documents arrivent d'affilée | Moyenne (dépend du volume réel attendu) |

*Déjà conforme depuis cette session* : génération de checklist via Mistral (grounded, avec repli déterministe), complétude déterministe, seuil d'extraction natif (40 caractères) avant bascule OCR — tout vérifié en conditions réelles.

---

## 🟣 SQUAD C — Cohérence, Falsification & Rapports

| # | Tâche | Écart constaté | Priorité |
|---|---|---|---|
| C1 | **Retraitement après échec transitoire** | Un timeout Mistral sur la cohérence reste figé indéfiniment sur le dossier — une resoumission est idempotente et ne relance jamais l'analyse. **Reproduit réellement cette session** | **Haute** |
| C2 | **Vraie boucle d'investigation forensic** | L'agent fraude actuel : un seul appel Mistral, systématique pour **chaque** document à **chaque** soumission (jamais conditionné par une alerte de cohérence), sans boucle, sans OpenCV/ELA (détection de recompression d'image, totalement absente) | Haute |
| C3 | **ExifTool garanti actif** | Le code sait utiliser ExifTool mais seulement si le binaire est présent sur le PATH système — jamais le cas dans les environnements testés ; repli silencieux sur un parseur PDF pur Python | Moyenne |
| C4 | **Traduire les erreurs techniques avant affichage citoyen** | En cas d'échec LLM, le message brut de la librairie HTTP ("The read operation timed out") est montré tel quel dans le rapport citoyen — fuite d'un détail d'implémentation | Moyenne |

*Déjà conforme* : le score de cohérence et la sévérité des anomalies sont réellement calculés (pas arbitraires), le prompt anti-injection est systématique, testé en conditions réelles (8 incohérences correctement détectées sur un dossier de test).

---

## 🟠 SQUAD D — Espace Agent CAF, Batch & Chatbot RAG

| # | Tâche | Écart constaté | Priorité |
|---|---|---|---|
| D1 | **Chatbot agent dédié** | Un seul chatbot existe (`/citizen/chatbot/message`), côté citoyen uniquement. Aucun accès étendu aux 4 sources réglementaires ni ton technique/analytique pour l'agent | Moyenne |
| D2 | **Assignation agent ↔ dossier** | File d'instruction totalement partagée — tout agent voit tous les dossiers non décidés, aucune notion de "mes dossiers". Règle métier à définir (auto ou manuelle) | Moyenne |
| D3 | **Tableau de bord admin (reporting agrégé)** | N'existe pas : nombre de dossiers traités, temps moyen d'instruction, taux d'anomalies — rien de tout ça. Seul un flux d'audit brut est consultable (`/audit/recent`) | Moyenne |
| D4 | **Traçabilité des consultations agent** | Seules les **actions** (décision, soumission, contestation) sont auditées. La simple **lecture** d'un dossier par un agent n'est pas journalisée — point RGPD à combler | Moyenne |
| D5 | **Rate-limiting API** | Aucune protection trouvée sur les endpoints d'auth ni sur la file d'instruction — à évaluer selon l'exposition réelle du service | Moyenne |
| D6 | **Traitement par lot ("batch")** | L'architecture cible mentionne un dashboard agent avec traitement batch ; aujourd'hui chaque décision se prend dossier par dossier, aucune action groupée | Basse |

*Déjà conforme* : RAG hybride BM25+Qdrant avec fusion RRF exacte (formule standard, k=60) ; isolation des rôles au niveau prompt (citoyen vs technique) pour le chatbot existant.

---

## Point transverse (n'appartient à aucune squad seule)

**Unifier le pipeline sous un vrai orchestrateur LangGraph.** Aujourd'hui,
LangGraph existe dans deux graphes isolés (agent de profilage — Squad A ;
orchestrateur RAG chatbot — Squad D). Le pipeline checklist → complétude →
cohérence → fraude (Squads B et C) est une suite d'appels Python séquentiels,
pas les nœuds d'un même state engine. Réunifier tout ça sous un seul graphe
est un chantier d'intégration qui ne peut se faire qu'une fois les squads B et
C d'accord sur leurs interfaces respectives — à traiter après, pas en
parallèle des tâches ci-dessus.
