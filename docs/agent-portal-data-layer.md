# Agent Portal — Data Layer Architecture

> Scope: introduce the domain model, service and hook layers that let the Agent Portal consume
> backend-ready `Case` objects today from fixtures and tomorrow from REST, without UI changes.
> Status: **implemented.** `tsc -b` and `vite build` pass; mock service verified at runtime.
> Date: 2026-07-22 · Baseline: `main` @ 8ffc6e7

---

## 1. Current architecture analysis

**Stack.** Vite 6 + React 18 + React Router 6 — *not* Next.js. No SSR, no server components. TypeScript
strict, `@/` path alias, Tailwind design tokens, Radix + CVA primitives, Zustand for UI/session state.
No data-fetching library.

**Layering as found.**

| Layer | Location | State before this work |
|---|---|---|
| Domain types | `src/types/*` | Split by business area, barrel-exported. Sound. |
| Services | `src/services/*` | Interface-only contracts; every method a `notImplemented` throw. |
| HTTP client | `src/services/apiClient.ts` | Shape defined, `request()` unimplemented. |
| Agent feature | `src/features/agent/` | Route table, paths, navigation, 9 lazy pages. |
| Hooks | `src/hooks/*` | UI-only (`useDocumentTitle`, `useMediaQuery`). No data hooks. |

The interface-first service pattern the brief asks for in Phase 7 **already existed** for the Citizen
Portal. This work extends it to the agent domain rather than introducing it.

## 2. Problems identified

1. **No `Case` model.** The central business object of the platform had no type anywhere.
2. **Domain type inside a component.** `AgentQueueRow` was declared in `AgentDashboardPage.tsx` — a
   model leaking into a view, and the duplication risk the brief targets.
3. **No agent service.** `CaseListPage` and `CaseDetailPage` referenced `agentCaseService` in prose;
   no such module existed.
4. **No async-state convention.** Nowhere to put loading/error/empty handling, so each page would
   have invented its own — and the error case would have gone missing.
5. **No projection boundary.** Nothing defined which side computed `waitingDays`, score bands or
   queue counts, so those would have landed in components by default.

### 2.1 A premise correction

The brief describes the Agent Portal as "mock-data-dependent" and asks for a refactor away from
hardcoded arrays. **This was not the case.** The portal was deliberately *empty*:

```ts
/** Empty until an agent-facing service exists. No citizen is fabricated here. */
const QUEUE: AgentQueueRow[] = [];
```

The same stance appears in `sessionStore.ts` and both case pages. There were zero mock objects to
remove. The work was therefore **additive** — building the three missing layers — not a
mock-removal refactor.

Introducing fixtures (Phase 4) knowingly reverses that stance. It is contained: all synthetic data
lives in one file, reachable only through one adapter, and both are deletable in a single step.

## 3. Refactoring strategy

Extend the existing citizen-side pattern into the agent domain, changing no existing convention:

- `Case` goes in **shared** `src/types/` — both portals describe the same object, and a duplicate
  agent-local copy is exactly what Phase 8 forbids. It reuses `HouseholdComposition`,
  `HousingDetails` and `CitizenDocument` rather than redeclaring them.
- The service is **agent-local** (`features/agent/services/`), matching the portal's extractability
  rule: `features/agent/index.ts` stays the only import surface for the host app.
- Two implementations behind one binding, so the cutover is one line.
- A generic `useAsyncResource` rather than a new dependency — the need is fetch-on-mount with four
  states, roughly 40 lines. TanStack Query can replace its body later behind the same return shape.

## 4. Files modified

| File | Change |
|---|---|
| `src/types/index.ts` | Export `./case` |
| `src/features/agent/components/index.ts` | Export the four new shared components |
| `src/features/agent/dashboard/pages/AgentDashboardPage.tsx` | Consumes hooks; local `AgentQueueRow` and hardcoded `QUEUE` removed |
| `src/features/agent/cases/pages/CaseListPage.tsx` | Consumes `useAgentCases` with URL-held search |
| `src/features/agent/cases/pages/CaseDetailPage.tsx` | Consumes `useAgentCase`; renders the full case |

No Citizen Portal file was touched. (`Header.tsx`, `Sidebar.tsx`, `sessionStore.ts` etc. show as
modified in git — that is pre-existing uncommitted work from the routing phase, not this change.)

## 5. Files created

```
src/types/case.ts                                     ← domain model
src/features/agent/
├── services/agentCaseService.ts                      ← interface + httpAgentCaseService
├── services/index.ts                                 ← the one-line swap point
├── data/fixtures.ts                                  ← ⚠️ synthetic, deletable
├── data/mockAgentCaseService.ts                      ← fixture-backed adapter
├── hooks/useAsyncResource.ts                         ← generic async state
├── hooks/useAgentCases.ts                            ← useAgentCases / useAgentQueueStats / useAgentCase
├── hooks/index.ts
├── lib/casePresentation.ts                           ← domain → design-system vocabulary
├── components/AsyncBoundary.tsx                      ← loading / error / empty / loaded
├── components/CaseQueueTable.tsx
├── components/CaseScore.tsx
├── components/CaseStatusBadge.tsx
└── cases/components/{CaseProfileCard,CaseDocumentsCard,CaseReportsCard}.tsx
```

## 6. Domain model changes

`Case` is the stored aggregate; `CaseSummary` is the list projection. Supporting types: `CaseCitizen`,
`CaseService`, `CaseProfileSnapshot`, `CaseDocument`, `CaseStatus`, `CaseScore`, `CaseScoreBand`,
`CompletenessReport`, `CoherenceReport`, `CoherenceAnomaly`, `CaseQueueStats`, `CaseDecision`.

Three decisions worth recording:

- **`CaseSummary` is separate from `Case`.** `GET /agent/cases` must not ship every document of every
  case to render a six-column table. It is a structural subset, so one fixture set feeds both views.
- **`CaseScore.band` comes from the backend.** Deriving "high" from `87` in the UI would put the
  scoring thresholds in a second system and guarantee drift when they are retuned.
- **`CaseProfileSnapshot` is frozen at submission,** not a live profile reference. An agent instructs
  against what was declared; a later citizen profile edit must not change the case under review.
- **NIR arrives pre-masked** (`maskedSocialSecurityNumber`). The frontend never holds the full number,
  so there is nothing to redact client-side.

## 7. Data flow, before and after

```
BEFORE   Component ── renders ──▶ local const QUEUE: [] = []
                                  (empty array declared in the page file)

AFTER    Component ──▶ Hook ──▶ Service ──▶ Data source
         (renders)   (state)  (contract)   (fixtures today, REST tomorrow)
```

The component knows only the hook. The hook knows only `agentCaseService`. The service knows only its
interface. Nothing above the data source knows where a case came from.

## 8. Service and hook architecture

```
useAgentCases(query)      ─┐
useAgentQueueStats()      ─┼─▶ agentCaseService ─▶ mockAgentCaseService ─▶ fixtures.ts
useAgentCase(id)          ─┘   (services/index.ts)     ↕ swap here
                                                   httpAgentCaseService ─▶ apiClient ─▶ REST
```

`useAsyncResource` returns `{ data, error, isLoading, reload }` and guards against stale responses: an
`active` flag prevents a slow reply for a previous `id` from overwriting a newer one, which otherwise
shows case A's data after the user has opened case B.

`AsyncBoundary` renders the four states once, centrally. When the service starts making real network
calls, failure is already handled on every screen — the cutover surfaces no new UI work.

## 9. Mock data strategy

Three complete `Case` objects in `data/fixtures.ts`, chosen to exercise every branch of the UI:

| Case | Status | Score | Completeness | Coherence |
|---|---|---|---|---|
| 2026-APL-0417 | `ready_for_decision` | 87 / high | passed, 100 % | passed, 0 anomalies |
| 2026-APL-0392 | `under_review` | 54 / medium | warning, 75 % | warning, 1 anomaly |
| 2026-APL-0355 | `awaiting_documents` | 28 / low | failed, 40 % | failed, 2 anomalies |

Identities are synthetic and marked as such: `-Test` surnames, `.test` e-mail addresses (RFC 6761),
masked placeholder NIRs. A banner comment states the file is not production data.

`mockAgentCaseService` deliberately performs the work the backend will own — the `Case → CaseSummary`
projection, `waitingDays`, query filtering, and the stats aggregation. If any of that migrated into a
hook or component, swapping in `httpAgentCaseService` would silently drop behaviour the UI depends on.

## 10. Agent Dashboard adaptation

Three tiles (`GET /agent/cases/stats`) plus the queue head (`GET /agent/cases`). Both read through
hooks; the page contains no fetch, no filter and no arithmetic.

The counters are a service call rather than a `.filter().length` over the loaded rows on purpose: the
queue endpoint will be paginated and filtered, so a client-side tally would report the size of the
current page, not the size of the workload.

Columns: reference, applicant, submitted date, score, status, **Voir**.

## 11. Case Details adaptation

`useAgentCase(caseId)` → one `Case`, rendered as a pure projection across four sections: synthesis
(reference, service, submission date, status, score with model and timestamp), applicant and declared
situation, the two report cards side by side, and the document list.

No processing occurs. Document statuses, report outcomes, completion rate and anomalies are all
displayed exactly as received — no OCR, no re-validation, no re-scoring, no rights evaluation.

## 12. Future REST API integration flow

```
PostgreSQL/Supabase ─▶ Backend API ─▶ apiClient ─▶ agentCaseService ─▶ hooks ─▶ components
```

Cutover, in full:

1. Implement `request()` in `src/services/apiClient.ts` (auth header, 401 refresh, error
   normalisation) — already stubbed with that TODO.
2. Fill in `httpAgentCaseService`'s three methods with `apiClient` calls plus DTO→domain mapping.
3. Change one line in `features/agent/services/index.ts`.
4. Delete `features/agent/data/`.

No page, component or hook is edited. That property is the reason the indirection exists.

## 13. Backend service interaction model

| Frontend call | Endpoint | Returns |
|---|---|---|
| `agentCaseService.listCases(query)` | `GET /agent/cases?status=&search=` | `CaseSummary[]` |
| `agentCaseService.getCase(id)` | `GET /agent/cases/{id}` | `Case` |
| `agentCaseService.getQueueStats()` | `GET /agent/cases/stats` | `CaseQueueStats` |

All three are reads. The Agent Portal is a consumer of already-processed cases: it does not score,
analyse documents, run OCR, invoke AI agents or evaluate rights. Writes (the instruction decision)
belong to a later `decide()` method on the same contract.

## 14. PostgreSQL / Supabase compatibility

No UI component imports Supabase, and none should. The abstraction is `AgentCaseService`, so the
backing store is invisible above the data layer — Supabase client, PostgREST or a bespoke API all
satisfy the same interface.

DTO/domain separation is preserved at the service boundary: `httpAgentCaseService` is where snake_case
rows become camelCase domain objects (`application_number` → `applicationNumber`, `submitted_at` →
`submittedAt`). Nested reports and documents map to their own sub-objects there, so a schema change
touches one file.

## 15. Architecture quality checklist

| Check | Result |
|---|---|
| Agent Portal follows existing architecture | ✅ interface-first services, feature-local, `index.ts` sole import surface |
| Citizen Portal unchanged | ✅ no citizen file modified; only `types/index.ts` gained one export line |
| No duplicated models | ✅ `Case` shared; `AgentQueueRow` deleted; reuses existing profile/document types |
| No business logic in UI | ✅ projections, counts, filtering, sorting all in the data layer |
| No direct mock usage in UI | ✅ `fixtures` imported only by `mockAgentCaseService` |
| API swap is minimal | ✅ one line in `services/index.ts` |
| Design system preserved | ✅ existing primitives only; no new dependency, no token changed |
| Routes functional | ✅ route table untouched |
| Typecheck / build | ✅ `tsc -b` clean, `vite build` succeeds |
| Bundle isolation | ✅ fixtures land in a lazy agent chunk; citizen bundle unaffected |

### Known gaps

- **Pagination is not implemented.** `CaseQuery` carries `status` and `search` only. The endpoint will
  need `page`/`pageSize`, and `listCases` should then return `Paginated<CaseSummary>` — that type
  already exists in `types/common.ts`.
- **Search is unthrottled.** Every keystroke re-queries. Harmless against fixtures; add debouncing
  before it hits a real endpoint.
- **`npm run lint` cannot run** — the script is declared but ESLint is not installed or configured.
  Pre-existing, unrelated to this change.
- **The remaining agent screens** (documents, validation, reports, assistant) are untouched
  placeholders. They can now follow this same pattern.
- **Not visually verified in a browser.** Verified by typecheck, production build, Vite module
  transform and a runtime smoke test of the service; the browser extension was unavailable.
