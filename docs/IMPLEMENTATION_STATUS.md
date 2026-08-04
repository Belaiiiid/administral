# MonParcours — Implementation Status

_Living document. Compares the implementation against the two authoritative
specs — `FUNCTIONAL_SPECIFICATION.html` (architecture logique) and
`TECHNICAL_ARCHITECTURE.html` (architecture technique) — and records each
iteration. Newest iteration first._

Legend: ✅ complete · 🟡 partial / diverges · ❌ missing.

---

## Iteration 7 — Fraud module (Agent C4): from a 48% confidence ceiling to calibrated multi-evidence fusion (2026-08-04)

Starting point: manual testing showed the fraud analysis topping out at **48%
confidence** even on documents with clear anomalies. Diagnosis before any
code change: this is architectural, not a bug in one detector.

### Root cause

`confiance` (`fusion.py`) measures evidence *coverage and corroboration*, not
probability of fraud — and it was structurally incapable of reaching high
values. Contributing factors, all fixed or documented below:

- Every detector's own reliability, and every calibration curve, was capped
  well below 1.0 — even a maximally certain deterministic signal (MRZ
  checksum invalid) calibrated to 0.98 at best, never 1.0.
- TruFor — the single highest-weight, highest-reliability detector (16% of
  fusion weight) — has never been deployed (`FRAUD_VISION_ENDPOINT` points to
  nothing running), silently dropping its entire weight from every analysis.
- `metadata.py`'s "no software metadata → suspicious" rule fired on nearly
  every JPG/PNG uploaded via a phone or messaging app (WhatsApp strips EXIF
  from all photos it touches, legitimate or not) — noise, not signal, for a
  citizen-facing upload flow.
- `ExifTool` (external binary) was silently absent in this environment,
  degrading metadata confidence and missing the EXIF sub-IFD entirely
  (`Image.getexif()` only reads the base IFD0 — `DateTimeOriginal` was never
  found even when present).

### What changed

- **`metadata.py`** — ExifTool replaced by `exifread` (pure Python, reads the
  EXIF sub-IFD ExifTool did) plus a namespace-agnostic XMP packet scanner
  (catches Producer/CreatorTool written only to XMP — common for
  Photoshop/Canva/GIMP exports the old fallback never saw). The
  no-software-metadata rule is now PDF-only; removed entirely for JPG/PNG.
- **`integrity.py`** — PDF signature check upgraded from "field present" to
  real cryptographic validation via **pyHanko**: `intact`/`valid` against the
  signed byte range. A document edited after signing is now detected
  (`SIGNEE_ALTEREE`, integrity score 1.0), not just flagged as "has a
  signature, unverified".
- **`twodoc.py` (new)** — decodes and verifies the 2D-Doc/Datamatrix carried
  by many French administrative documents (avis d'imposition, justificatif de
  domicile, bulletin de salaire, carte d'identité) against the real ANTS
  trust list, via `fr_2ddoc_parser` (DINUM/betagouv). Also cross-checks the
  barcode's decoded fields against the OCR'd visible text — a barcode that is
  cryptographically valid but whose content doesn't match the page it's on is
  a stronger and more realistic fraud signal than an invalid signature alone
  (a lazy forger reuses a genuine code rather than fabricating a new one).
  Data Matrix decoding uses `pylibdmtx`: `pyzbar`/ZBar could not decode a real
  Data Matrix in testing despite its own documentation suggesting it could.
- **`llm_analyzer.py` / `service.py`** — Mistral now receives the document's
  actual page image(s) (base64, up to 2 pages), not just a JSON metadata
  summary, and is explicitly prompted for an *independent* visual/contextual
  judgment rather than a restatement of the other detectors' findings. Its
  verdict is now fused as real evidence (`llm_vision` detector) instead of
  being computed and then discarded — previously
  `llm_raw["niveau_risque"] = fused["niveau_risque"]` overwrote it
  unconditionally after the fact.
- **`fusion_config.json`** — calibration ceilings for near-certain
  deterministic signals (MRZ checksum invalid, PDF signature altered, 2D-Doc
  signature invalid) raised to a true 1.0. A weaker, more ambiguous signal
  (exact file duplicate elsewhere in the dossier — plausibly an honest
  double-upload) deliberately keeps a lower ceiling (~0.67).
- Two real mojibake bugs (UTF-8 decoded as Latin-1 and re-encoded, doubling
  the corruption) fixed in `integrity.py` and `vision_model.py` signal text.

### Dependency notes for whoever runs `pip install` next

`fr_2ddoc_parser` declares `cryptography<44.0.0` and `pydantic>=2.12.4`;
pyHanko declares `cryptography>=48.0.0`. These are mutually exclusive, so a
single `pip install -r requirements.txt` resolution is impossible — verified,
not assumed: `fr_2ddoc_parser`'s own signature verification works correctly
against the newer `cryptography`/`pydantic` actually pinned, so its bounds
are stale rather than a real incompatibility. Resolved with a second file,
**`requirements-2ddoc.txt`**, installed with `--no-deps` after the main file
(see its header comment and `backend/README.md`). The main `pydantic` pin
also moved 2.11.2 → 2.13.4 for this — project-wide, not fraud-module-only;
verified against the fraud module's own code but **not re-run against the
full backend test suite**.

### Explicitly deferred (scoped, not built)

- **TruFor deployment** — the wrapper is already coded (`vision_model.py`),
  but the upstream project ships a batch CLI in Docker, not an HTTP service;
  pins PyTorch 1.11.0 (2022, needs its own isolated environment, incompatible
  with what's used elsewhere in this backend); and needs a ~260 MB weights
  download. Needs a small FastAPI wrapper + bounding-box extraction from its
  anomaly map before `FRAUD_VISION_ENDPOINT` can point at anything real.
- PDF revision diffing (pikepdf) — currently only counts `%%EOF` markers;
  diffing what object actually changed between revisions was proposed but not
  built.
- Screen-recapture (moiré) detection, a template-conformity detector per
  document type, and API Particulier / FranceConnect source verification —
  all discussed as high-value follow-ups, none started.

### Testing

13/13 tests in `tests/test_fraud.py` pass, including new coverage for the PDF
signature sign/tamper round-trip and the 2D-Doc decode/verify path (using a
real — if untrusted-authority — 2D-Doc string from `fr_2ddoc_parser`'s own
test suite). The live Mistral vision call is untested here: no API key is
configured in this environment, consistent with how the rest of this module
already avoids hitting the live LLM in tests — needs a manual check with a
real key.

---

## Iteration 6 — Citizen assistant: engine re-synced, structured clarification, real checklist (2026-07-28)

The assistant's engine (migrated APL RAG, `app/modules/chatbot/rag/`) was a
snapshot of an older upstream version. It is now re-synced with the current one,
and the two MonParcours-specific mocks it shipped with are gone.

### Three intents instead of four — the assistant no longer reads the account

- Upstream merged `depot_dossier` (my dossier) and `autre_profil` (someone
  else's) into a single **`documents_necessaires`**: with no authentication on
  the target channel, both start from zero knowledge, so both are answered the
  same way — by asking. The classifier now has three intents
  (`documents_necessaires`, `rag_general`, `fallback`).
- Consequence here, and it is deliberate: the assistant **does not read the
  signed-in citizen's dossier or profile any more**. The account is used for one
  thing only — the caller's *role* (`citizen`/`agent`), which widens the corpus
  the retrieval may search (`legislation` for agents; filter in place, corpus not
  yet populated). Dossier tracking stays in the citizen space, which is
  untouched; `citizen`/`submission` services are unchanged, simply not called
  from the chatbot. Behaviour is therefore identical for a signed-in web user and
  for a channel with no account at all.
- Greetings ("Bonjour") are detected by keyword and answered with a welcome
  message — no LLM call, no misrouting.

### Structured clarification (the answer options are now buttons)

- When an answer depends on the citizen's situation, the assistant asks instead
  of guessing, and the question comes back as `options` + `pendingClarification`.
  Answering by clicking an option **bypasses intent classification** (the reply
  carries `isClarificationReply`, set by the UI — never inferred from the text),
  which is what stops "je suis locataire, mon loyer est 400 €" from being read as
  a brand-new request.
- Two options are appended **by code, not by prompt**, to every choice list:
  « Je ne comprends pas, expliquez-moi » and « Passer cette question ».
- No session is added: like `conversationHistory`, the clarification state makes
  a round trip through the client.

### `documents_necessaires` is no longer a mock — it returns the real checklist

- Upstream ends its profiling flow on a `[MOCK]` for lack of a personalised
  checklist generator. MonParcours has one, so it is wired in
  (`chatbot/checklist_answer.py` → `ai.checklist.service.generate_checklist`,
  Mistral with the deterministic `checklist_rules` as its safety net).
- The profile driving it is **declarative**: only what the person stated during
  the conversation. Nothing is read from the account, and the LLM only fills
  profile fields (bounded by the `ProfilPartiel` enums) — it never decides which
  documents are required. Unknown fields or values are dropped, so an empty or
  hallucinated profile degrades to the core checklist rather than an error.

### Validation

- Backend **109/109 pass**. Live round-trips: greeting → welcome; "quels
  documents pour la demande d'APL de mon fils étudiant ?" → 3 profiling questions
  (with the two guaranteed options) → real checklist including *certificat de
  scolarité*, *notification de bourse (CROUS)* and *contrat de location*;
  "comment est calculée l'APL ?" → clarification, then a sourced answer;
  off-topic → fallback. HTTP contract checked on `/api/citizen/chatbot/message`,
  including a forged `pendingClarification.intent` → **422** (the intent is
  bounded, a client cannot name an arbitrary node). Frontend `tsc -b --noEmit`
  clean.

### Files

- Backend: `app/modules/chatbot/rag/*` (engine re-synced: 3 intents, structured
  clarification, role-based corpus filter, multi-provider LLM client with
  `@traceable`), `app/modules/chatbot/checklist_answer.py` (**new** — declarative
  profile → real checklist), `chatbot/{service,schemas,router}.py`,
  `requirements.txt` (+langsmith), `.env.example` (optional assistant vars). No
  schema/migration change.
- Frontend: `features/chatbot/` — `types/chatbot.ts`, `services/chatbotService.ts`,
  `hooks/useChatbot.ts` (`selectOption`, clarification bookkeeping),
  `components/{MessageBubble,ChatWindow,SourceCitation}.tsx` (option buttons,
  multi-line answers, `legislation` category).

---

## Iteration 5 — Coherent citizen workflow: live checklist, working assistant, one dossier (2026-07-27)

Fixes to the citizen path so it is dynamic and coherent end to end, per user
report ("checklist toujours statique, chatbot ne répond pas, dossier reste
statique quand on change le profil").

### The citizen AI assistant now answers (was silent)

- **Root cause.** Every general APL question routed to `rag_general`, whose
  `RagPipeline` built a semantic index requiring a sentence-transformers model
  download. Under the installed `huggingface_hub` 1.x the download hangs/fails
  ("Cannot send a request, as the client has been closed"), so the lazy
  singleton never became ready — the startup warm-up hung, and every request
  re-hung then degraded to "L'assistant est momentanément indisponible".
- **Fix — resilient, bounded retrieval** (`rag/rag_pipeline.py`). BM25 (pure
  Python, no download) is always built. The semantic index is now **optional and
  time-boxed**: built in a daemon thread with a timeout (`CHATBOT_SEMANTIC_TIMEOUT_S`,
  default 25 s; `CHATBOT_SEMANTIC=0` disables it). If it isn't ready in time the
  pipeline serves **BM25-only** — grounded, cited answers from the local corpus,
  with Mistral generation unchanged. Verified: a real question now returns a
  sourced answer (intent `rag_general`) instead of the outage message.

### One citizen dossier, profile-driven and dynamic (was two, one static)

- **The "front statique".** `DocumentUploadPage` (the primary "Déposer un
  document" + "Soumettre" flow) was hardwired to a fixed demo dossier
  `TEST-DOSSIER-0001` and the profile-agnostic checklist — so changing the
  profile never changed it. The profile-driven dossier lived on a *separate*
  page (`/mon-dossier`).
- **Unified onto `/mon-dossier`** (`PersonalizedDossierPage`), now the single,
  complete dossier: **état civil (NIR + date de naissance) vérifié → checklist
  personnalisée (dérivée du profil) → dépôt des pièces → complétude →
  transmission → instruction (cohérence, décision, contestation)** — all keyed
  on the citizen's *own* `application.id`. The legacy upload page is now a
  redirect here; the sidebar CTA and the "Déposer un document" links point here.
- **NIR + date de naissance** are captured and **required before submission**
  (inline, via the existing `PATCH /citizen/profile`), addressing "ajoute la
  saisie du numéro de sécurité sociale et la date de naissance … d'après la
  checklist on vérifie".

### Profiling answers persist live (checklist regenerates as the citizen talks)

- The profiling turn endpoint kept answers only in an in-memory session
  (30-min TTL); nothing reached the DB until the citizen pressed "Enregistrer",
  so the personalised checklist stayed stale while they answered. The profiling
  store now **persists each valid answer** to the profile (best-effort, no-op
  without a citizen session), which triggers `_resync_dossier` — so the checklist
  regenerates live as the citizen interacts.

### Validation

- Backend **109/109 pass**; live round-trip (rolled back): empty profile → 4
  core items; declaring *locataire + salarié* → **7 items** (contrat de location,
  attestation de loyer, bulletins de salaire added); submitting the citizen's own
  application emits a `Case`; review reads it back. Chatbot answers a general
  question with a source. Frontend `tsc --noEmit` clean; `npm run build` succeeds.

### Files

- Backend: `features/citizen/chatbot/rag/rag_pipeline.py` (BM25 fallback +
  time-boxed semantic build). No schema/migration change.
- Frontend: `features/documents/pages/PersonalizedDossierPage.tsx` (unified
  dossier), `pages/DocumentUploadPage.tsx` (→ redirect), `services/dossierService.ts`
  (+submit/getReview), `features/citizen/profiling/store/profilageStore.ts`
  (auto-persist), `app/config/navigation.ts` + `pages/DocumentsPage.tsx` (links).

---

## Iteration 4 — Unified dossier flow + MonParcours Result (2026-07-26)

Two moves: removed the last duplicated checklist logic (one generator for every
dossier), then combined the four separate analyses into a single deterministic
agent assessment — the spec's **résultat structuré unique**.

### Part 1 — Unified checklist generation

- **One generation path.** `repository.create_application` no longer populates
  the fixed seven-item `APL_CHECKLIST`; it creates an *empty* application. Every
  dossier — the anonymous demo one and each citizen's personalised one — now
  gets its checklist from the single deterministic generator
  (`dossier.sync_checklist` → `checklist_rules`). The demo dossier, having no
  profile, receives the universal core (a blank profile's output).
- **`APL_CHECKLIST` kept as a catalog, not a generator.** It remains the
  classifier's fallback target and the canonical id/label set the tests pin —
  its role as a *second checklist builder* is what was removed.
- **No breakage.** `create_application_for_citizen` (the Iteration-3 duplicate)
  is gone, folded into `create_application(citizen_id=…)`. Existing uploads,
  the `/documents` and `/applications/*` APIs, and the completeness calculation
  are unchanged; citizen and agent still share the `Application`/`Case` models.

### Part 2 — MonParcours Result (unified assessment)

- **One deterministic, explainable score.** New `agent/assessment.py` combines
  the four analyses already on the `Case` into a weighted global score —
  **completeness 35 % · coherence 30 % · document quality 20 % · vigilance 15 %**
  — computed purely by arithmetic. **No LLM decides the score, and the AI does
  not decide eligibility**: the result is a decision-support band
  (favorable / vigilance / défavorable) plus recommended human review actions,
  never a ruling. The *décision humaine* guardrail is restated in the payload's
  disclaimer.
- **Each category** carries `score` (0–100), `status`, `explanation`, and
  `evidence` (missing pieces, incoherences, illegible files, fraud flags).
  Vigilance penalises per-document fraud risk (`CRITIQUE`/`ÉLEVÉ`/… ) and
  coherence error-anomalies; higher score = lower concern.
- **Stored + audited on change.** Persisted as JSONB on the `Case`, recomputed
  on read and rewritten only when its inputs change (e.g. the async fraud pass
  landing), so `assessment_generated` / `assessment_updated` mark real changes,
  not every view. `GET /api/agent/cases/{id}/assessment` (require_agent).
- **Agent UI.** `CaseAssessmentCard` at the top of the dossier: global score +
  band, the four category tiles with explanations and evidence, the recommended
  review actions, and the decision-support disclaimer. **Not exposed to
  citizens** — the citizen keeps only their personalised dossier + progress.

### Files

- Added (backend): `app/modules/agent/assessment.py`, `tests/test_assessment.py`,
  `alembic/versions/20260726_1600_e5f6a7b8c9d0_case_assessment.py`.
- Modified (backend): `app/modules/citizen/{repository,service,dossier}.py`
  (unified checklist path), `app/modules/agent/{models,service,router}.py`
  (assessment columns + endpoint), `app/modules/audit/models.py`
  (`assessment_generated` / `assessment_updated`).
- Added (frontend): `features/agent/services/agentAssessmentService.ts`,
  `features/agent/hooks/useCaseAssessment.ts`,
  `features/agent/cases/components/CaseAssessmentCard.tsx`.
- Modified (frontend): `features/agent/services/index.ts`,
  `features/agent/hooks/index.ts`,
  `features/agent/cases/components/index.ts`,
  `features/agent/cases/pages/CaseDetailPage.tsx`.

### Score calculation method

`global = round(0.35·completeness + 0.30·coherence + 0.20·documentQuality + 0.15·vigilance)`,
each term a 0–100 category score: completeness = `completion_rate`; coherence =
`coherence_score` (or the outcome band); document quality = share of uploaded
pieces that are validated *and* text-extracted; vigilance = `100 −` fraud-risk
and error-anomaly penalties. Weights live in one place and are asserted to sum
to 1.

### Validation performed

- `alembic upgrade head` applied (two `assessment` columns on `cases`; two audit
  actions; no other schema change) to live PostgreSQL.
- Live round-trip, rolled back — **Part 1:** the demo dossier's checklist is the
  4-item core from the one generator (no static `contrat_location`), audited as
  `checklist_generated`. **Part 2:** a Case with 80 % completeness / 75 coherence
  / clean docs scored **86 favorable**; a second read wrote no new event
  (idempotent); flipping a document to `ÉLEVÉ` fraud dropped vigilance to 70 and
  recorded `assessment_updated`; **hash chain intact**.
- Backend **109/109 tests pass** (96 prior + 13 assessment). App imports clean;
  `/api/agent/cases/{id}/assessment` registered; existing citizen-document tests
  still green (catalog + classification unaffected).
- Frontend `tsc --noEmit` clean; `npm run build` succeeds.

---

## Iteration 3 — Personalised dossier generator (2026-07-26)

Turned the "Constitution guidée" checklist from a fixed seven-item list into a
**deterministic, profile-driven** one — the missing "B1 node" the code itself
flagged (`checklist.py`: *"until that node is wired, this canonical list is the
contract"*). Closes the loop **profiling → structured profile → checklist →
required documents → existing upload/completeness flow** without rewriting any
of those stages.

### Features completed

- **Deterministic checklist generator** (`checklist_rules.py`). A pure function
  mapping `ProfilPartiel` → the documents that profile implies, each with a
  profile-grounded reason. **No LLM, no I/O**: same profile → same checklist,
  every item explainable — honouring the rule that *the LLM collects/explains,
  it never decides required documents*. Grounded in real APL requirements
  (tenant → lease; owner → loan schedule; student → enrolment (+ scholarship
  notice); jobseeker → France Travail (+ ARE); children/partner → livret de
  famille, partner income; etc.), de-duplicated by `item_key`.
- **Dossier service** (`dossier.py`). Reconciles the generated target onto the
  application's existing `ChecklistItem` rows as a **diff** — surviving items
  keep their `received` state, so a profile change never discards an upload.
  Reuses the existing table, upload, classification and completeness flow.
- **Regenerate on profile change.** `PATCH /citizen/profile` and the profiling
  `save_profiling_answers` path resync the checklist (best-effort; the read path
  self-heals), so the required documents follow the citizen's declared situation.
- **`GET /api/citizen/dossier`** returns the personalised checklist: each item as
  `{documentType, libelle, categorie, required, reason, status}` where status is
  the three-state **missing / uploaded / validated** derived from the citizen's
  uploads, plus completeness counts and a `profileComplete` nudge flag.
- **Uploads match personalised items.** The upload flow now classifies against
  the application's *own* checklist, not the fixed list, so newly generated
  item keys are matchable — the classifier can only match a key it is shown.
- **Citizen UI.** New "Mon dossier personnalisé" page: documents grouped by
  category, each with its reason and a status badge, an inline dropzone per
  missing piece (reusing the existing `Dropzone` + upload), and a completeness
  bar. Added to the citizen rail; the older generic list is relabelled
  "Mes documents" to disambiguate.

### Audit

- Two new actions, recorded atomically with the change under the `application`
  entity: **`checklist_generated`** (first population) and **`checklist_updated`**
  (a later profile change). Idempotent: an unchanged profile writes nothing.

### Files

- Added (backend): `app/modules/citizen/checklist_rules.py`,
  `app/modules/citizen/dossier.py`, `tests/test_checklist_rules.py`,
  `alembic/versions/20260726_1400_d4e5f6a7b8c9_checklist_audit_actions.py`.
- Modified (backend): `app/modules/audit/models.py`,
  `app/modules/citizen/{repository,schemas,service,profile,router}.py`.
- Added (frontend): `types/dossier.ts`, `services/dossierService.ts`,
  `features/documents/pages/PersonalizedDossierPage.tsx`.
- Modified (frontend): `types/index.ts`, `app/router/{paths.ts,index.tsx}`,
  `app/config/navigation.ts`.

### Validation performed

- `alembic upgrade head` applied the migration (two audit actions; **no table
  change** — the checklist reuses `checklist_items`) to live PostgreSQL.
- Live end-to-end round-trip against real PostgreSQL, rolled back:
  profile (tenant/employee/child) → checklist generated (lease + payslips +
  livret) with all items *missing*; **idempotent** second read (no new event);
  profile change (student/scholarship/residence) regenerates (residence replaces
  lease, student docs replace payslips); a matched+received upload flips the
  item to *validated* and advances completeness; audit shows
  `checklist_generated` then `checklist_updated`; **chain intact**.
- Backend **96/96 tests pass** (81 prior + 15 checklist-rules). App imports clean;
  `/api/citizen/dossier` registered.
- Frontend `tsc --noEmit` clean; `npm run build` succeeds.

---

## Iteration 2 — Droit de contestation + audit-chain correctness fix (2026-07-26)

Closed the third cross-cutting guardrail of the functional spec — **droit de
contestation** — building directly on the immutable audit trail from Iteration 1,
and fixed a latent correctness bug in that trail found while validating this work.

### Features completed

- **Droit de contestation, end to end.** A citizen may formally challenge the
  decision on their *own* decided dossier; an agent reviews and resolves it.
  New `contestation` module (`contestations` table) with a strict state machine
  **PENDING → UNDER_REVIEW → (ACCEPTED | REJECTED)** — a resolution may also be
  reached directly from PENDING; the two outcomes are terminal. Enforced
  server-side, never trusted from the client.
- **Every transition is audited, atomically.** `contestation_created` (citizen),
  `contestation_review_started` and `contestation_resolved` (agent) are written
  into the same immutable, hash-chained trail as submission and decision,
  **inside the transaction** that changes the state — so a challenge or its
  resolution cannot exist without its trace. The events are recorded under the
  `case` entity, so they appear in the dossier's existing audit timeline.
- **The agent remains the sole decider.** The AI never resolves a contestation;
  the resolving agent's real name is stamped (`reviewed_by`) — the *décision
  humaine* guardrail — and a **motive is mandatory** at resolution.
- **APIs.** Citizen: `POST /api/contestations`, `GET /api/contestations/my`.
  Agent: `GET /api/contestations` (status-filterable), `GET /api/contestations/{id}`,
  `PATCH /api/contestations/{id}/review`, `PATCH /api/contestations/{id}/resolve`.
- **Notifications.** Filing fans out to every agent (`contestation_filed`);
  resolution notifies the citizen (`contestation_resolved`, in-app + opt-in
  e-mail). Best-effort, like the existing emitters — never rolls back the action.
- **Citizen UI.** A "Contester cette décision" control appears on the decision
  surface once a decision exists; a form (categorised reason + explanation)
  files the challenge; the filed challenge and the agent's resolution are shown
  in place, with a status badge.
- **Agent UI.** A new **Contestations** section: a status-filtered queue and a
  detail page showing the contested decision, the citizen's explanation, a
  one-click link into the full dossier (its documents/reports are the evidence),
  the dossier's audit timeline, and the review / resolve actions.

### Bugs fixed / improvements

- **Audit hash chain was silently broken across sessions (guardrail defect).**
  `_compute_hash` hashed `occurred_at.isoformat()`. A `timestamptz` written as
  `datetime.now(UTC)` (`+00:00`) and reloaded in a session whose timezone is,
  say, `Europe/Paris` comes back as `+01:00` — the *same instant*, a *different
  string*, a different hash. So `verify_chain` in any non-UTC session (exactly
  what `/audit/verify` and the trail endpoints do per request) would falsely
  report "Intégrité compromise". Fixed by canonicalising `occurred_at` to UTC
  before hashing; every existing event (all written in UTC) now verifies again,
  no history invalidated. Locked in with a regression test.

### Files

- Added (backend): `app/modules/contestation/{__init__,models,schemas,repository,service,router}.py`,
  `alembic/versions/20260726_1200_c3d4e5f6a7b8_contestations_table.py`,
  `tests/test_contestation.py`.
- Added (frontend): `types/contestation.ts`, `services/contestationService.ts`,
  `features/documents/components/DecisionContestation.tsx`,
  `features/agent/services/agentContestationService.ts`,
  `features/agent/hooks/{useContestations,useContestationActions}.ts`,
  `features/agent/contestations/pages/{ContestationListPage,ContestationDetailPage}.tsx`.
- Modified (backend): `app/core/exceptions.py` (+`ForbiddenError`),
  `app/modules/audit/{models,service}.py`, `tests/test_audit.py`,
  `app/modules/notifications/{models,service}.py`, `app/database/models.py`, `app/main.py`.
- Modified (frontend): `types/index.ts`, `features/agent/services/index.ts`,
  `features/agent/hooks/index.ts`, `features/agent/paths.ts`,
  `features/agent/routes.tsx`, `features/agent/config/navigation.ts`,
  `features/agent/cases/components/CaseAuditCard.tsx`,
  `features/documents/pages/DocumentUploadPage.tsx`.

### Validation performed

- `alembic upgrade head` applied the migration (new table + `contestation_*`
  audit actions + `contestation_*` notification types) to live PostgreSQL.
- Live end-to-end round-trip against real PostgreSQL, rolled back: ownership
  guard (403 for a non-owner), decided-dossier precondition, duplicate-open
  guard (400), review → UNDER_REVIEW, resolve → ACCEPTED, terminal re-resolve
  refused (400), all three audit actions recorded, and **`verify_chain` intact
  across the commits** (the bug above, now fixed).
- Backend **81/81 tests pass** (70 prior + 10 contestation + 1 audit regression).
  App imports clean; all six contestation routes registered.
- Frontend `tsc --noEmit` clean; `npm run build` succeeds.

---

## Iteration 1 — Immutable audit trail + real deciding agent (2026-07-26)

Closed the strongest spec-mandated gap: the cross-cutting **Traçabilité totale**
guardrail (functional spec) and the **log immuable SHA-256** (technical spec,
Harness layer), previously absent.

### Features completed

- **Immutable, hash-chained audit trail.** New `audit` module: append-only
  `audit_events` table where each row carries the SHA-256 of its content chained
  onto the previous row's hash (`previous_hash` → `event_hash`). Tampering with
  or deleting any past entry breaks every hash after it, which `verify_chain`
  detects. This is the "log immuable SHA-256" without needing a write-once store.
- **Three flows now audited, atomically.** `dossier_submitted` (submission),
  `decision_recorded` (agent decision), `profile_updated` (citizen profile
  edit). The event is written **inside the same transaction** as the action, so
  an untraceable action cannot occur and a rolled-back action leaves no orphan
  trace — deliberately *not* best-effort, unlike notifications (a guardrail must
  not silently fail).
- **Read API.** `GET /api/audit/{entity_type}/{entity_id}` (agent — the dossier
  trail for assisted review), `GET /api/audit/recent` and `GET /api/audit/verify`
  (admin — global chain integrity). No HTTP write path exists: history cannot be
  forged by a client.
- **Agent UI.** `CaseAuditCard` on the case detail page renders the dossier's
  trail and a "Chaîne vérifiée / Intégrité compromise" badge.

### Bugs fixed / improvements

- **`decided_by` was a hardcoded placeholder** (`"Agent (démonstration)"`),
  violating the **Décision humaine** guardrail. The decision endpoint now
  resolves the authenticated agent from the token and stamps their real name;
  the same identity is recorded as the audit actor. `decide_case` gained an
  `agent: User` parameter, threaded from `require_agent`.
- **Privacy in the trail:** a profile edit records the *names* of the fields
  changed, never the values — the NIR and birth date are exactly what the audit
  log must not duplicate.

### Files

- Added: `backend/app/modules/audit/{__init__,models,schemas,service,router}.py`,
  `backend/alembic/versions/20260726_1000_a1b2c3d4e5f6_audit_events_table.py`,
  `backend/tests/test_audit.py`,
  `frontend/src/features/agent/services/agentAuditService.ts`,
  `frontend/src/features/agent/hooks/useCaseAuditTrail.ts`,
  `frontend/src/features/agent/cases/components/CaseAuditCard.tsx`.
- Modified: `backend/app/database/models.py`, `backend/app/main.py`,
  `backend/app/modules/agent/{service,router}.py`,
  `backend/app/modules/citizen/{submission,profile}.py`,
  `frontend/src/features/agent/services/index.ts`,
  `frontend/src/features/agent/hooks/index.ts`,
  `frontend/src/features/agent/cases/components/index.ts`,
  `frontend/src/features/agent/cases/pages/CaseDetailPage.tsx`.

### Validation performed

- `alembic upgrade head` applied the migration to the live PostgreSQL.
- Live round-trip against real PostgreSQL (JSONB + enum), rolled back: genesis
  link on first event, correct chaining, `verify_chain` → intact, trail lookup,
  and tamper detection → `(False, first_broken_id)`.
- Backend **70/70 tests pass** (65 prior + 5 new audit tests). App imports clean.
- Frontend `tsc --noEmit` clean; `npm run build` succeeds.
- All three audit routes confirmed registered on the app.

---

## Gap analysis vs the specifications (current state)

### Functional spec — Architecture logique

| Function | Item | State | Note |
|---|---|---|---|
| 01 Citizen | Accueil & profilage | ✅ | LangGraph profiling agent |
| 01 Citizen | Constitution guidée (checklist, vulgarisation, chatbot **texte**) | ✅ | checklist now **profile-driven & deterministic** (Iteration 3), not a fixed list |
| 01 Citizen | Chatbot **vocal** | ❌ | Voice input/output not implemented (button was removed as unbacked) |
| 01 Citizen | Anticipation des réserves (simulateur CAF) | 🟡 | APL amount simulator exists; "simulate the agent's objections before submission" not built |
| 02 Agent | Réception & tri (file priorisée) | ✅ | Queue + stats |
| 02 Agent | Revue assistée (preuve par signal) | ✅ | + audit trail (this iteration) |
| 02 Agent | Notification & suivi | ✅ | in-app + opt-in email |
| 02 Agent | **Lettre de complément** générée | ❌ | No letter generation |
| 03 Core | Extraction | ✅ | |
| 03 Core | Vérification de complétude | ✅ | |
| 03 Core | Analyse de cohérence | ✅ | |
| 03 Core | Résultat structuré **unique** (catégorie incomplet/non-éligible/incohérence/suspect + confiance) | ✅ | **MonParcours Result** (Iteration 4): one deterministic 4-category weighted assessment (complétude/cohérence/qualité/vigilance) |
| Output | Vue citoyen vulgarisée | ✅ | dossier review |
| Output | Vue agent catégorisée (vert/jaune/rouge) | ✅ | score band |
| Guardrail | Décision humaine | ✅ | now with real agent identity |
| Guardrail | **Traçabilité totale** | ✅ | Iteration 1; cross-session verify bug fixed in Iteration 2 |
| Guardrail | **Droit de contestation** | ✅ | **completed this iteration** — citizen challenge, agent review/resolve, fully audited |
| Guardrail | Consentement RGPD | 🟡 | `cross_administration_sharing` setting exists; explicit consent capture partial |

### Technical spec — Architecture technique

| Layer | Item | State | Note |
|---|---|---|---|
| Frontend | React + Tailwind, citizen + agent portals | ✅ | |
| Frontend | Recharts (agent charts) | 🟡 | Charts minimal; verify usage |
| API | FastAPI, JWT, Pydantic v2 | ✅ | roles CITIZEN/AGENT/ADMIN |
| API | Upload → **MinIO / object storage** | 🟡 | Local filesystem (`upload_dir`), not S3/MinIO |
| Harness | Output validation (strict schema, retry max 2, json_object) | 🟡 | Per-AI-service, fail-safe; no unified harness with enforced retry |
| Harness | **Log immuable SHA-256** | ✅ | **completed this iteration** |
| Orchestration | LangGraph | ✅ | profiling + chatbot |
| Orchestration | LangSmith observability | 🟡 | Assistant's LLM calls are `@traceable` (Iteration 6); inactive unless `LANGSMITH_*` set. Other AI modules not instrumented |
| Agent d'analyse | 8 phases | 🟡 | OCR/completeness/coherence/reports ✅; voice + reserve simulator ❌ |
| Outils | OCR multimodal (Pixtral) | 🟡 | Extraction present; confirm Pixtral wiring |
| Outils | RAG réglementaire | ✅¹ | Qdrant + BM25 hybrid (spec named ChromaDB) — divergence kept, superior |
| Outils | Connecteurs mock (FranceConnect/DGFIP/CAF) | ❌ | Not present |
| Données | PostgreSQL 16 | ✅ | |
| Données | Redis 7 (sessions TTL 30 min) | 🟡 | In-memory stand-in, not Redis |
| Données | MinIO (documents & rapports) | 🟡 | Local filesystem |
| Modèles | Mistral Medium / Pixtral / Embed | 🟡 | Generation via Mistral; embeddings local model, not Mistral Embed |

¹ Deliberate, documented divergence — see `docs/ARCHITECTURE_REVIEW.md`. Qdrant+BM25
hybrid retrieval is functionally superior to the spec's ChromaDB and was not rebuilt.

---

## Next recommended priorities

Ordered by value against the specs:

1. **Voice assistant** — text-to-speech + speech-to-text on the citizen chatbot
   (Web Speech API). Explicitly required by both specs; was removed as unbacked.
2. **Unified structured result** — collapse completeness + coherence + fraud +
   score into the spec's single verdict with one of the four categories
   (incomplet / non-éligible / incohérence / suspect) and a confidence level,
   feeding both existing views without re-analysis.
3. **Complement letter generation** — the agent "lettre de complément" from the
   decision + evidence already recorded (Mistral generation, human-editable).
   A rejected contestation is a natural trigger for one.
4. **Explicit RGPD consent capture** at registration / first submission, itself
   an audited event — the last of the four cross-cutting guardrails.
5. **Infrastructure alignment** — MinIO object storage, Redis-backed profiling
   sessions, LangSmith traces; each swaps an existing interface, no rewrite.
6. **DB-backed integration tests** over the audited flows (submit → decide →
   contest → review → resolve → verify trail), building on the live round-trips
   done by hand so far.
7. **Contestation follow-through** — optionally let an accepted contestation
   reopen the dossier for re-decision (today the agent re-decides via the
   existing decision endpoint), and attach evidence uploads to a challenge.
