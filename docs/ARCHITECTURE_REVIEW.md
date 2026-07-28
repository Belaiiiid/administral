# MonParcours — Architecture Review

_Technical review produced at the close of the stabilization phase (Tasks 1–10).
Scope: identity model, structural issues found and fixed, the system as it now
stands, and recommended next steps. It documents decisions and state; it is not a
change log._

---

## 1. Identity model decision

### Current shape

```
users                         citizens
─────                         ────────
id (PK)                       id (PK, uuid)
email (unique)        ┌────►  user_id (FK → users.id, UNIQUE, ON DELETE SET NULL)
password_hash         │       first_name / last_name / email
role  (CITIZEN|        │      birth_date (nullable)
       AGENT|ADMIN)   │       social_security_number (nullable)
is_verified           │       profile_data (JSONB)  ← profiling answers
                      │       profile_updated_at
                      └────── (one row per applicant, created on first need)
```

### Recommendation: **keep the separation, enforced by the foreign key.**

`User` and `Citizen` answer two different questions and must not be merged:

- **`User` is authentication identity** — "who is this, and what may they do?"
  It owns the credential (`password_hash`), the verification state, and the single
  authority on permissions: `users.role`.
- **`Citizen` is the domain profile** — "what did this applicant declare?" Civil
  status, housing, household, the profiling answers. It is attached to cases; it
  is not a login.

Collapsing them would put nullable, slowly-changing business fields on the
security-critical table and give every applicant record a password column it has
no use for. Keeping them apart is correct.

**The enforcement that matters:** the link is now a real foreign key,
`citizens.user_id → users.id` (unique, `ON DELETE SET NULL`). The earlier code
reconciled the two tables by **matching on `email`** — a field the user can edit,
which is both a correctness hazard (two rows for one person the moment an address
changes) and a security one (email was simultaneously the join key and
user-controlled). The live path now resolves exclusively on `user_id`
(`citizen/profile.resolve_citizen`); the email match survives only as a one-time
migration adoption of pre-FK rows, never as the ongoing rule.

### Roles: `users.role` is the sole discriminator

`CITIZEN`, `AGENT`, `ADMIN` are a single enum column. **There is no `agents`
table and there must not be one** — an agent is a `users` row whose `role` is
`AGENT`. Everything downstream reads this one column: the JWT `role` claim
(re-checked against the DB on every request), the `require_citizen` /
`require_agent` / `require_admin` guards, and the frontend `sessionStore` journey
split. `ADMIN` is admitted wherever `AGENT` is; `CITIZEN` is deliberately **not**
widened into staff surfaces (see §2, permission fix).

Verified against the live database: all foreign keys present with correct
`ON DELETE` rules, zero dangling `citizens.user_id`, zero dangling
`cases.citizen_id`, and the only `user_id IS NULL` citizens are the seeded
demo-fixture applicants (by design — they have no login).

---

## 2. Structural issues discovered (and their resolution)

| # | Issue | Impact | Resolution |
|---|-------|--------|-----------|
| 1 | **Identity joined by email string**, not a FK | duplicate applicant rows on email change; email was join key *and* editable field | Real FK `citizens.user_id`; `resolve_citizen` keys on it; migration backfills + adopts legacy rows |
| 2 | **Fabricated civil-status placeholders** (`1990-01-01`, fifteen-zero NIR) written for undeclared fields | an agent could not tell a declared value from an invented one | Columns made nullable; placeholders cleared; "absent" now reads as absent |
| 3 | **Profile had no write path** — profiling answers lived only in a 30-min in-memory session, persisted once (frozen) at submission | nothing the citizen told the assistant survived a restart; the profile "Save" button was a no-op | `GET/PATCH /citizen/profile`; living `profile_data` JSONB on `citizens`; ProfilePage wired to the real PATCH |
| 4 | **`require_citizen` admitted AGENT/ADMIN** | an agent hitting a citizen-only surface silently created a bogus `citizens` row for staff | Tightened to `require_role(CITIZEN)` — the one guard that does not widen to staff — with a regression test |
| 5 | **Shared header linked every role to the citizen profiling page** | an agent's "Mon profil" landed on the citizen profiling assistant | Header made role-aware; minimal `AgentProfilePage` (name/email/role) added |
| 6 | **No notifications, no per-user settings** | dead notification UI; empty settings skeletons | New `notifications` + `user_settings` tables, endpoints, event emitters, and wired UI on both portals |
| 7 | **Dead UI elements** — header search, help button, chat attachment/voice buttons, "save draft" button, chatbot mini-form, empty Guides/FAQ | buttons that did nothing; a disconnected assistant page | Removed the unbacked ones (search, attachment, voice, Guides/FAQ placeholders); wired the rest (help → assistant, draft → dashboard, mini-form → assistant) |
| 8 | **Chatbot was a standalone page only** | the assistant was reachable from one route, not where the citizen works | Floating launcher mounted once in the citizen `AppShell`, available on every citizen page, with deep-link navigation actions |
| 9 | **Engine ships `[MOCK]` chatbot nodes** (`depot_dossier`, `autre_profil`) | fabricated strings in production code (bypassed by the service layer in the API, but reachable from the dev CLI) | Service layer already overrode them with real dossier/profiling logic; the two node strings replaced with honest guidance |

**Not a defect — deliberate and preserved:** the citizen↔agent dossier bridge
(`Application` → `Case` at submission), the four AI pipelines, and the in-memory
profiling session (a Redis stand-in, by design). These were extended, never
rewritten.

---

## 3. Final architecture overview

### Frontend (`frontend/src`) — React + Vite + TypeScript

- **Routing** — `react-router-dom`, code-split at the route boundary. Three
  shells: `AuthLayout` (login/register/emailed-link landings), `FocusLayout`
  (distraction-free onboarding, incl. signup-first profiling), `AppShell` (the
  authenticated application — rail + header + footer, shared by both portals and
  gated by role).
- **State** — Zustand stores: `sessionStore` (JWT-backed identity + journey role),
  `notificationStore`, `uiStore` (sidebar + accessibility), `profilageStore`
  (assistant session), `chatbotUiStore` (floating launcher). Services never call
  `fetch` directly — one `apiClient` owns auth headers and error normalisation.
- **Feature modules** — `features/auth`, `features/portal` (citizen dashboard /
  notifications / settings), `features/citizen/profiling`, `features/documents`,
  `features/chatbot`, `features/apl` (service module), and `features/agent` — the
  back-office, an internally-encapsulated module the host mounts wholesale and
  which could be extracted into a standalone app.

### Backend (`backend/app`) — FastAPI, modular monolith

- **`modules/auth`** — accounts, roles, JWT, guards, email-verification &
  password-reset tokens (single-use, hashed at rest), admin staff provisioning.
- **`modules/citizen`** — documents (upload → extract → classify → checklist),
  the living **profile** read/write, and **submission** (the citizen→agent
  bridge).
- **`modules/agent`** — the case queue, decision workflow (evidence-grounded),
  and the `Citizen` applicant model.
- **`modules/notifications`** / **`modules/settings`** — cross-cutting, per-user,
  same endpoints for both portals, scoped by `user_id`.
- **`modules/ai`** — coherence, fraud, explanation, extraction.
- **`features/citizen/profiling`** — the A2/A3/A4 profiling agent (LangGraph).
- **`features/citizen/chatbot`** — the hybrid RAG assistant.

### Database (PostgreSQL + SQLAlchemy 2.x, Alembic migrations)

```
users ──┬─< auth_tokens
        ├─< notifications
        ├─< user_settings
        └─1 citizens ──< cases ──┬─< case_documents
                                 ├─1 completeness_reports ──< completeness_items
                                 ├─1 coherence_reports ──< coherence_anomalies
                                 └─1 case_decisions ──< decision_evidence
applications ──< application_documents
             └─< checklist_items      (citizen-side dossier assembly, pre-Case)
```

Every relationship is a real foreign key with an explicit `ON DELETE` rule. A
`Case` is a **frozen snapshot** taken at submission; the `citizens` row is the
**living profile** that keeps changing — the two are intentionally distinct.

### AI pipelines (all Mistral + one local embeddings model) — preserved as-is

1. **Profiling agent** — LangGraph loop (A3) that fills `ProfilPartiel` one field
   at a time; deterministic clarification/off-topic handling.
2. **Completeness** — checklist-driven, from the real uploaded documents.
3. **Coherence** — deterministic OCR/readability checks + a Mistral verdict,
   fail-safe, run synchronously at submission; produces a 0–100 score.
4. **Fraud (C4)** — metadata + Mistral-large verdict, run as a background task
   after submission so the citizen never waits.
5. **Chatbot RAG** — hybrid BM25 + Qdrant retrieval, LangGraph intent router,
   Mistral generation, grounded in the official corpus (service-public.fr F12006,
   caf.fr) with structured citations. Dossier / profiling intents are answered by
   the MonParcours service layer, not the engine's placeholder nodes.

### Authentication flow

```
register (CITIZEN only) / login ──► JWT (HS256, ~30 min, role claim)
   stored in localStorage ──► apiClient attaches Bearer on every call
   ──► get_current_user decodes + RELOADS the user row (a token cannot outlive a
       role change by more than its lifetime)
   ──► require_citizen / require_agent / require_admin gate each route
Emailed links (verify-email, reset-password) are public: the single-use hashed
token is the credential. Password-reset answers identically for known/unknown
addresses (no account-enumeration oracle).
```

---

## 4. Recommended next improvements

Ordered roughly by value-to-effort:

1. **Automated integration tests against the DB.** The suite is currently
   pure-unit (65 tests, deliberately DB-free); the full flows are verified live by
   hand. A `pytest` + transactional-fixture layer over the real endpoints
   (auth → profile → submit → decide → notify) would lock in what is now manually
   checked.
2. **Real applications tied to the account.** The document flow still operates on
   a fixed demo application id (`TEST-DOSSIER-0001`); applications should be
   created per authenticated citizen, mirroring what the profile/notification
   work already did for `citizens`.
3. **Production email provider.** The `EmailBackend` interface is ready (console
   in dev); wiring SMTP is config-only. Needed before verification / reset /
   decision emails are real to end users.
4. **Audit log.** Decisions, submissions, and profile edits are high-value events
   with no dedicated immutable trail today. An append-only `audit_events` table
   would support both compliance and debugging.
5. **CI/CD + monitoring.** No pipeline runs the build, `tsc`, and tests on push;
   no error/latency telemetry on the AI calls (which depend on an external LLM).
   Both are prerequisites for operating this beyond a demo.
6. **Security hardening.** Move the JWT off `localStorage` toward an httpOnly
   cookie; add rate-limiting on auth and the LLM-backed endpoints; make
   email-verification a login precondition if policy requires it (a one-line
   change already flagged in `auth/models`).
7. **Notification email opt-out is wired for decisions only.** Extend the
   `email_notifications` setting to the agent "new dossier" fan-out if that
   channel is wanted, and consider batching to avoid N sends per submission.

---

_Companion documents: `TECH_STACK.md` (stack + model table),
`agent-portal-implementation-plan.md`, `frontend-architecture-review.md`._
