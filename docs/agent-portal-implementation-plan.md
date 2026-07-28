# Agent Portal — Technical Implementation Plan

> Scope: introduce a complete Agent Portal as an isolated feature domain under `src/features/agent`,
> without touching the Citizen Portal, the design system, or the build setup.
> Status: **plan awaiting approval — no code written.**
> Date: 2026-07-21 · Baseline: `main` @ 8ffc6e7 (94 files under `src/`)

---

## 1. Baseline — what already exists

The repository is **not** greenfield for this work. Three agent-related seams already exist:

| Asset | Location | State |
|---|---|---|
| Feature folder | `src/features/agent/pages/AgentDashboardPage.tsx` | One provisional page, self-declared as a skeleton |
| Route branch | `src/app/router/index.tsx` | `<ProtectedRoute role="agent">` → `<AppShell>` → `ROUTES.agent` |
| Path constant | `src/app/router/paths.ts` | `agent: '/agent'` (single path) |
| Navigation | `src/app/config/navigation.ts` | `AGENT_NAV` exported — **but never consumed** |

The architecture is already well-shaped for this: route-level `lazy()` code splitting, a single
`ROUTES` source of truth, interface-only service contracts, a UI layer (`components/ui`,
`components/shared`) with zero domain coupling, and Tailwind design tokens defined once in
`index.css` / `tailwind.config.ts`.

### 1.1 Two blockers found during analysis

These must be resolved in Phase 0 or the portal ships unreachable:

**B1 — the agent route is dead.** `src/store/sessionStore.ts` returns a frozen session with
`role: 'citizen'`. `ProtectedRoute` therefore redirects every `/agent` navigation to `/portal`.
Nobody has ever rendered `AgentDashboardPage` in a browser.

**B2 — the sidebar cannot show the agent rail.** `src/components/layout/Sidebar.tsx` imports
`PRIMARY_NAV` as a module constant. `AGENT_NAV` is exported but has no consumer, so an agent
navigating to `/agent` sees "Mes demandes / Simulateur APL / Aide IA".

Both are small fixes, but they are prerequisites, not follow-ups.

---

## 2. Target folder structure

The brief lists two different groupings (business modules *and* `components/hooks/services/types/data`).
The recommendation is a **hybrid**: business sub-domains own their own pages and local components;
the agent-level `components/` `hooks/` `services/` `types/` `data/` folders are the *shared-within-agent*
layer. This is what makes later extraction a folder move.

```
src/features/agent/
├── index.ts                    ← the ONLY file the host app imports
├── routes.tsx                  ← RouteObject[] for the whole portal, lazy-loaded
├── paths.ts                    ← AGENT_ROUTES, agent-local path builders
├── config/
│   └── navigation.ts           ← AGENT_NAV (moved here from app/config)
│
├── dashboard/                  ← business sub-domains
│   ├── pages/AgentDashboardPage.tsx      (moved from features/agent/pages/)
│   └── components/QueueSummary.tsx, WorkloadCard.tsx
├── cases/
│   ├── pages/CaseListPage.tsx, CaseDetailPage.tsx
│   ├── components/CaseTable.tsx, CaseFilters.tsx, CaseTimeline.tsx
│   └── hooks/useCaseFilters.ts
├── documents/
│   ├── pages/DocumentReviewPage.tsx
│   └── components/DocumentViewer.tsx, DocumentChecklist.tsx
├── validation/
│   ├── pages/ValidationQueuePage.tsx, ValidationDetailPage.tsx
│   └── components/DecisionPanel.tsx, RejectionReasonForm.tsx
├── reports/
│   ├── pages/ReportsPage.tsx
│   └── components/MetricTile.tsx, PeriodSelector.tsx
├── assistant/
│   ├── pages/AgentAssistantPage.tsx
│   └── components/AgentChatPanel.tsx
├── settings/
│   └── pages/AgentSettingsPage.tsx
│
├── components/                 ← shared across ≥2 agent sub-domains only
│   ├── AgentShell.tsx          ← nav-scoped layout wrapper
│   ├── AgentPageHeader.tsx
│   └── index.ts
├── hooks/
│   ├── useAgentSession.ts
│   ├── useAsyncResource.ts     ← minimal fetch-state hook (see §5)
│   └── index.ts
├── services/
│   ├── agentCaseService.ts     ← interface + notImplemented, mirrors aplService.ts
│   ├── agentDocumentService.ts
│   ├── agentReportService.ts
│   └── index.ts
├── types/
│   ├── case.ts, validation.ts, report.ts, agent.ts
│   └── index.ts                ← agent-local barrel, NOT merged into src/types
└── data/
    └── fixtures.ts             ← demo data, clearly typed, one file, easy to delete
```

**Promotion rule.** A component starts in its sub-domain's `components/`. It moves to
`features/agent/components/` only when a second sub-domain imports it. It moves to
`src/components/shared/` only when the *Citizen Portal* also needs it — and that is a
design-system decision requiring review, not a refactor anyone does in passing.

---

## 3. Routing strategy

### 3.1 Self-registering route module

The feature exports its own route tree; `src/app/router/index.tsx` changes by **one line**.

```tsx
// src/features/agent/routes.tsx
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { AGENT_ROUTES } from './paths';

const AgentDashboardPage = lazy(() => import('./dashboard/pages/AgentDashboardPage'));
const CaseListPage       = lazy(() => import('./cases/pages/CaseListPage'));
// …

export const agentRoutes: RouteObject[] = [
  { index: true,                        element: <AgentDashboardPage /> },
  { path: AGENT_ROUTES.cases,           element: <CaseListPage /> },
  { path: AGENT_ROUTES.caseDetail(),    element: <CaseDetailPage /> },
  { path: AGENT_ROUTES.documents,       element: <DocumentReviewPage /> },
  { path: AGENT_ROUTES.validation,      element: <ValidationQueuePage /> },
  { path: AGENT_ROUTES.reports,         element: <ReportsPage /> },
  { path: AGENT_ROUTES.assistant,       element: <AgentAssistantPage /> },
  { path: AGENT_ROUTES.settings,        element: <AgentSettingsPage /> },
];
```

Host wiring — the existing back-office branch gains a nested `path: '/agent'` parent:

```tsx
// src/app/router/index.tsx — the ONLY edit to this file
{
  element: <ProtectedRoute role="agent" />,
  children: [
    { element: <AppShell />, children: [{ path: ROUTES.agent, children: agentRoutes }] },
  ],
},
```

`ROUTES.agent` stays `'/agent'`, so the existing entry point does not move and nothing external breaks.

### 3.2 Path constants

Agent paths live in `features/agent/paths.ts`, built from the host's `ROUTES.agent` prefix — one
constant crossing the boundary, and the child paths travel with the folder on extraction.

```ts
// src/features/agent/paths.ts
const BASE = '/agent';
export const AGENT_ROUTES = {
  root: BASE,
  cases: `${BASE}/dossiers`,
  caseDetail: (id = ':caseId') => `${BASE}/dossiers/${id}`,
  documents: `${BASE}/pieces`,
  validation: `${BASE}/validation`,
  reports: `${BASE}/statistiques`,
  assistant: `${BASE}/assistant`,
  settings: `${BASE}/parametres`,
} as const;
```

URLs stay French, matching `/apl/simulateur`, `/documents/depot`, `/profile/accessibilite`.

### 3.3 Bundle impact

Every page is `lazy()`, so nothing agent-related enters the citizen initial bundle. Vite will hoist
the shared agent code (`components/`, `hooks/`, `services/`) into a common chunk loaded on first
`/agent/*` navigation. No manual `manualChunks` config needed.

---

## 4. Component reuse — sharing without coupling

### 4.1 The dependency contract

| Layer | Agent may import | Rationale |
|---|---|---|
| `@/components/ui/*` | ✅ | Radix + CVA primitives, zero domain knowledge |
| `@/components/shared/*` | ✅ | `PageHeader`, `StatusBadge`, `EmptyState`, `Timeline`, `DataRow` — already domain-neutral |
| `@/components/layout/*` | ✅ | `AppShell`, `Header`, `Footer` (see §4.2) |
| `@/lib/utils` (`cn`) | ✅ | Trivial utility |
| `@/types/common` | ✅ | `ProcessStatus`, `Paginated`, `Result`, `ApiError` |
| `@/hooks/*` | ✅ | `useDocumentTitle`, `useMediaQuery` |
| `@/store/uiStore` | ✅ | Sidebar/drawer state only |
| `@/store/sessionStore` | ✅ read-only | Identity and role |
| **`@/features/portal`, `apl`, `documents`, `profile`, `auth`, `chatbot`** | ❌ **never** | Feature-to-feature coupling is the one thing that makes extraction impossible |
| **`@/types/index`, `@/services/index`** | ❌ | Barrels re-export citizen domains; import the leaf file instead |

The design system needs **zero changes**. `StatusBadge` already renders the `ProcessStatus`
vocabulary the agent queue needs; `Table`, `Card`, `Alert`, `Input`, `Dialog` all exist. The
current `AgentDashboardPage` was already built this way and is the reference for the rest.

### 4.2 The layout problem, and the minimal fix

The agent needs a different navigation rail inside the *same* shell. Three options were considered:

| Option | Verdict |
|---|---|
| Duplicate `AppShell` as `AgentShell` | ❌ Forks the layout; two files drift |
| Prop-drill `navItems` through `AppShell` → `Sidebar` | ⚠️ Works, but every existing `AppShell` usage site becomes aware of nav |
| **Resolve nav from pathname inside `navigation.ts`** | ✅ **Recommended** |

```ts
// src/app/config/navigation.ts — additive, no existing export changes
export function resolveNavSections(pathname: string): { primary: NavItem[]; secondary: NavItem[] } {
  return pathname.startsWith('/agent')
    ? { primary: AGENT_NAV, secondary: AGENT_SECONDARY_NAV }
    : { primary: PRIMARY_NAV, secondary: SECONDARY_NAV };
}
```

`Sidebar.tsx` swaps two module-constant reads for one `resolveNavSections(pathname)` call. That is
the **entire** citizen-side diff: no component signature changes, no prop drilling, no visual change
to any citizen screen. `AGENT_NAV` finally gets its consumer (fixes **B2**).

`features/agent/components/AgentShell.tsx` stays a thin wrapper (max-width container + shared
page padding) — layout composition, not a second shell.

### 4.3 Design tokens

Nothing to do. Tokens are CSS custom properties in `index.css`, consumed through Tailwind utility
classes (`bg-surface-low`, `text-on-surface-variant`, `p-gutter`). Agent components use the same
classes. **No new token, no new Tailwind key, no `tailwind.config.ts` edit** — if a plan step seems
to require one, that is the signal to reuse an existing primitive instead.

---

## 5. State management

Ordered by preference — reach for the lowest tier that works:

1. **URL search params** — case filters, status tab, pagination, sort. Shareable, back-button
   correct, survives reload, and an agent pasting a filtered queue link into a ticket is a real
   workflow. `useSearchParams` from react-router; no library.
2. **Local `useState`** — dialogs, expanded rows, form drafts.
3. **Agent-scoped Zustand store** — `features/agent/store/` only if state must outlive navigation
   (e.g. multi-case selection carried across routes). Ships with the folder on extraction.
4. **Global stores** — `uiStore` for sidebar/assistant/accessibility, `sessionStore` for identity.
   **No agent domain concept is added to either.** `uiStore`'s own comment already states this rule.

**Server state.** There is no TanStack Query in `package.json`, and adding it is a
platform-wide decision outside this scope. Recommendation: ship
`features/agent/hooks/useAsyncResource.ts` (~40 lines: `{ data, error, isLoading }` + abort on
unmount). If the platform later adopts Query, this hook is the single replacement site.
*Flagged for a team decision — do not add the dependency unilaterally.*

**Service layer.** Mirror `aplService.ts` exactly: exported `interface`, plus a `notImplemented`
export. Pages import the *contract*, never transport. Fixtures live in `data/fixtures.ts` and are
injected at the service boundary so deleting demo data is one file.

---

## 6. Extraction readiness

After this work, extracting the Agent Portal into a standalone app is:

1. `git mv src/features/agent packages/agent-portal/src`
2. Publish `components/ui` + `components/shared` + `lib/utils` + `types/common` as `@civique/ui`
3. Replace `~6` `@/…` imports with `@civique/ui`
4. Add `main.tsx` + `AppProviders` (both trivial; the existing ones are ~20 lines)

What makes that true, and must be preserved:
- The feature has exactly **one** public entry (`index.ts`), exporting `agentRoutes` and `AGENT_NAV`.
- Agent types/services never enter `src/types/index.ts` or `src/services/index.ts`.
- Zero imports from sibling features.
- `AGENT_ROUTES` derives from one `BASE` constant.

---

## 7. Risks and mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **`/agent` unreachable** — `sessionStore` hardcodes `role: 'citizen'` (B1) | Blocker: portal cannot be demoed or reviewed | Phase 0: add `setRole()` to `sessionStore` + a dev-only role switch. **Not a security control** — real enforcement is server-side when auth lands. Document this explicitly. |
| R2 | **Citizen rail on agent pages** (B2) | Broken UX | §4.2 `resolveNavSections`. Verify all 5 citizen rail entries are byte-identical after the change. |
| R3 | Agent types leak into `src/types/index.ts` | Silently kills extraction | Keep `features/agent/types/index.ts` local; add the barrel to the review checklist. |
| R4 | Cross-feature import (e.g. reusing an APL component) | Same | ESLint `no-restricted-imports` zones — **but see R7** |
| R5 | Moving `AgentDashboardPage` into `dashboard/pages/` | Breaks the router import | Same commit as the router edit; path `/agent` itself does not change, so no external link breaks. |
| R6 | **No agent mockups exist** (`docs/design-analysis.md` §1.4) — the current page carries an explicit "écran provisoire" warning | Rework once designs arrive | Keep the warning `Alert` on every new agent page until designs land. Build only from existing primitives so a redesign is a re-composition, not a rewrite. |
| R7 | `package.json` declares `lint: eslint .` but **no ESLint config or dependency is installed** | Boundary rules (R3/R4) unenforceable | Either install ESLint + `no-restricted-imports` (recommended, ~1h) or accept manual review. **Team decision required.** |
| R8 | No test infrastructure | Regressions in shared `Sidebar` go unnoticed | Out of scope, but the `Sidebar` change is the one place a smoke test would pay for itself. Flagging, not blocking. |
| R9 | Bundle growth | Slower citizen first paint | Already mitigated by route-level `lazy()`. Verify with `npx vite build --mode production` before/after: **the citizen entry chunk must not grow.** |

---

## 8. Phasing

Each phase is an independently reviewable PR that leaves `main` working.

| Phase | Content | Touches citizen code? | Est. |
|---|---|---|---|
| **P0 — Unblock** | `sessionStore.setRole()` + dev switch (R1); `resolveNavSections` + `Sidebar` (R2); `AGENT_SECONDARY_NAV` | Yes — 2 files, ~15 lines | 0.5 d |
| **P1 — Skeleton** | Folder structure, `paths.ts`, `routes.tsx`, `index.ts`, router one-line wiring, move dashboard page, all sub-domain pages as stubs behind the "provisional" Alert | Yes — 1 line in `router/index.tsx` | 1 d |
| **P2 — Contracts** | `types/*`, `services/*` (interface + `notImplemented`), `data/fixtures.ts`, `useAsyncResource` | No | 1 d |
| **P3 — Cases + Validation** | The two core workflows: list, filters (URL state), detail, decision panel | No | 3 d |
| **P4 — Documents, Reports, Assistant, Settings** | Remaining sub-domains | No | 3 d |
| **P5 — Hardening** | ESLint boundary rules (R7), bundle verification (R9), `README`/`docs` update | Repo config only | 0.5 d |

**Gate after P1:** confirm no citizen screen changed visually and the citizen entry chunk did not
grow, before any P2+ work starts.

---

## 9. Open decisions for the team

1. **R7 — install ESLint?** Without it, §4.1's dependency contract is convention only.
2. **§5 — server-state library?** `useAsyncResource` now, or adopt TanStack Query platform-wide?
3. **R6 — proceed without mockups?** This plan assumes yes, building only from existing primitives
   and keeping the provisional warning visible. Confirm that is acceptable.
4. **R1 — is a client-side dev role switch acceptable** in a GovTech context pre-auth, even labelled
   non-security? Alternative: gate it behind `import.meta.env.DEV`.
