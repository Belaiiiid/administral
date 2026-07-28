# MonParcours — Solution status & roadmap

> What exists, what was just cut over, and what remains for a complete solution.
> Date: 2026-07-23 · Branch: `main`

---

## 1. What just changed: mock data removed

Every mock and fixture has been **deleted** from the frontend. The application no
longer contains any fabricated data. What was mocked in the browser now runs
server-side against PostgreSQL.

**Deleted:**

| File | What it did | Where it went |
|---|---|---|
| `agent/data/fixtures.ts` | 3 hand-written `Case` objects | `backend` → seeded rows in PostgreSQL |
| `agent/data/mockAgentCaseService.ts` | projection, `waitingDays`, filtering | `agent/repository.py` + `service.py` |
| `agent/data/evidenceExtraction.ts` | reads blocking/supporting evidence | `agent/evidence.py` |
| `agent/data/mockExplanationService.ts` | composes the explanation | `ai/explanation.py` |
| `agent/data/mockDecisionService.ts` | the decide sequence + status write | `agent/service.decide_case` |
| `agent/services/explanationService.ts` | the Mistral seam (interface) | `ai/explanation.py` (server-only) |
| `chatbot/data/mockChatbotService.ts` | keyword retrieval + answers | `ai/chatbot/knowledge_base.py` + `service.py` |
| `services/chatService.ts` | dead duplicate contract, unused | removed |

**The cutover was one line per binding.** `agent/services/index.ts` and
`chatbot/services/index.ts` now point at the `http*` implementations. No page,
component or hook was rewritten — the indirection those files existed to provide
is now demonstrated rather than asserted. `apiClient.request()`, previously a
stub, is now a real `fetch` client with error normalisation.

**Verified end to end through the Vite proxy** (`:5173/api → :8000`, the exact
path the browser uses):

- queue, stats, case detail, chatbot — all return live PostgreSQL data
- reject a clean case → `400`, surfaced in the UI as `MissingEvidenceError`
- every evidence value appears verbatim in its explanation (anti-hallucination invariant)
- full NIR never crosses the wire (grep of the response: 0 occurrences)
- `tsc -b` and `vite build` pass; 9 backend tests pass

**Not verified:** nothing was rendered in a browser — the Chrome extension is
not connected in this environment. The HTTP path is proven; the visual result is
inferred from it.

---

## 2. Current architecture

```
frontend/  Vite + React + TS       backend/  FastAPI + SQLAlchemy + PostgreSQL
─────────────────────────          ──────────────────────────────────────────
Component                          Router      HTTP only
   ↓                                  ↓
Hook                               Service     business rules
   ↓                                  ↓
Service (interface)                Repository  SQL only
   ↓                                  ↓
apiClient  ──────  HTTP  ─────►    PostgreSQL

                     seam a model will occupy:
                     ai/explanation.py   (decision wording → Mistral)
                     ai/chatbot/         (retrieval → RAG + Mistral)
```

The frontend depends on `src/types/case.ts`; the backend's Pydantic schemas
mirror it field for field, camelCase included. That shared contract is why the
cutover needed no translation layer.

---

## 3. What works today

| Capability | Endpoint | Status |
|---|---|---|
| Instruction queue | `GET /api/agent/cases` | ✅ live |
| Dashboard counters | `GET /api/agent/cases/stats` | ✅ live |
| Case detail (full aggregate) | `GET /api/agent/cases/{id}` | ✅ live |
| Record decision (approve/reject) | `POST /api/agent/cases/{id}/decision` | ✅ live |
| Citizen assistant | `POST /api/citizen/chatbot/message` | ✅ live |
| Health + DB reachability | `GET /api/health` | ✅ live |

Business rules enforced server-side: evidence is mandatory for rejection; a
clean case cannot be rejected; explanations are composed only from extracted
evidence; the AI score is never quoted to a citizen; the NIR is masked in one
function every response passes through.

---

## 4. What is missing for a complete solution

Ordered by how much it blocks everything else.

### 4.1 Authentication & authorisation — **highest priority**

Nothing is protected. `GET /api/agent/cases` exposes citizen case data to any
unauthenticated caller. Every `decidedBy` is the constant `"Agent (démonstration)"`.

Needed:
- `modules/auth/` — login, token issuance, an agent-vs-citizen principal
- a router dependency (`app/core/security.py` has the slot marked) applied to
  `/agent/*` and to citizen-scoped routes
- real agent identity on decision records, replacing the constant
- **FranceConnect** for citizen identity — the frontend already has the button
  (`features/auth/components/FranceConnectButton.tsx`), unwired

Until this exists the app cannot be exposed beyond localhost.

### 4.2 Citizen-side write paths

The citizen portal renders but persists nothing. The pipeline that *produces* a
`Case` does not exist — cases only enter via the seed script.

Needed: `modules/citizen/` and `modules/services/apl/` with
- application submission (`profile`, `household`, `housing`)
- document upload + storage (object store; only metadata belongs in PostgreSQL)
- the processing pipeline the domain model documents:
  `application → documents → completeness → coherence → scoring → Case`
- `modules/services/apl/rules.py` — eligibility scoring. **This is the piece the
  agent portal was explicitly built _not_ to contain**: the score arrives
  pre-computed. It has to be built somewhere, and that somewhere is here.

The frontend services for these (`aplService`, `profileService`,
`documentService`) still throw `notImplemented` — they are the specification.

### 4.3 The AI seam: real RAG + Mistral

Today `ai/explanation.py` and `ai/chatbot/` use deterministic templates and
keyword matching. They occupy the correct seam with the correct contract, so
swapping the internals changes nothing above them. What is missing:

- **Explanation**: Mistral rephrasing a *closed* evidence list. The guarantee to
  preserve — the model may only restate facts it was given, never introduce one —
  is already encoded in the signature (`generate_explanation` takes evidence, not
  a Case). The test `test_explanation_cites_only_supplied_evidence` is what will
  catch a model that violates it.
- **Chatbot**: a real corpus, embeddings, a vector store, hybrid retrieval, and
  Mistral composing from retrieved passages. `knowledge_base.retrieve()` is the
  one function to replace.
- `modules/ai/rag/` and `modules/ai/agents/` are still empty placeholders.
- Config for model keys/endpoints belongs in `core/config.py`; the frontend must
  never learn any of it exists.

### 4.4 Decision workflow gaps (functional, not structural)

- No confirmation step before a rejection is committed.
- Re-deciding replaces the prior decision silently — no audit of the change
  (the row is deleted, not versioned).
- Long rejections read as one sentence citing five findings; readable but blunt.
- Feedback buttons in the chatbot (`MessageBubble`) are inert — no
  `submitFeedback` endpoint.

### 4.5 Production readiness

- **Pagination**: `GET /agent/cases` returns all rows. `Paginated<T>` exists in
  `types/common.ts`, unused. The counters are already computed server-side so
  they will stay correct when the list is paged.
- **Migrations discipline**: one initial migration exists. Every model change
  from here needs `alembic revision --autogenerate` and a human review of the
  output.
- **CORS/secrets**: `.env` only; nothing hardcoded. `.env.example` should carry
  no real values (see §6).
- **ESLint**: declared in `frontend/package.json` but not installed or
  configured — there is no lint gate on the frontend.
- **No CI**, no containerisation (Docker deliberately excluded so far), no
  structured logging sink, no rate limiting on the public endpoints.
- **Frontend README** still claims "Aucune donnée n'est simulée" — now literally
  true, but the surrounding text predates the backend and should be refreshed.

---

## 5. Suggested sequence

1. **Auth** (§4.1) — unblocks exposing anything; every later endpoint needs the
   guard anyway.
2. **Citizen submission + APL rules** (§4.2) — makes the platform end-to-end:
   a citizen creates a case, an agent decides it. Biggest functional gap.
3. **Pagination + migrations discipline** (§4.5) — cheap, and needed before real
   data volume.
4. **Real Mistral/RAG** (§4.3) — the seam is ready; this is an internal swap with
   no UI impact, so it can land whenever without blocking the above.
5. **Workflow polish + production hardening** (§4.4, rest of §4.5).

---

## 6. Immediate housekeeping

- `backend/.env.example` line 12 still holds a real password. That file **is**
  committed to git (unlike `.env`). Set it back to `your_password`.
- Nothing in this whole effort is committed yet. `origin/main` still points at a
  broken artifact commit (`15b79c7`) from the folder-migration session; the
  backup branch `backup/artifacts-commit-15b79c7` still exists. These want
  resolving before more work stacks on top.
