# Agent Portal — Decision Workflow

> Scope: activate the validation workflow — agent decision, evidence-backed citizen explanation —
> and prepare the seam a language model will later occupy.
> Status: **implemented.** `tsc -b` and `vite build` pass; workflow and its safety guard verified at runtime.
> Date: 2026-07-22 · Builds on `docs/agent-portal-data-layer.md`

**Final principle.** The agent makes the decision. The case evidence provides the truth. Mistral only
writes the explanation.

---

## 1. Files analyzed

`validation/pages/ValidationQueuePage.tsx`, `validation/pages/ValidationDetailPage.tsx`,
`features/agent/routes.tsx`, `paths.ts`, `types/case.ts`, `services/agentCaseService.ts`,
`services/index.ts`, `data/mockAgentCaseService.ts`, `data/fixtures.ts`, `hooks/useAgentCases.ts`,
`hooks/useAsyncResource.ts`, `components/AsyncBoundary.tsx`, `components/CaseQueueTable.tsx`,
`lib/casePresentation.ts`, `components/ui/button.tsx`.

### 1.1 Premise correction

The brief describes the Validation interface as "implemented but without business functionality," and
Step 6 asks to add behaviour to existing "Accepter" / "Rejeter" buttons. **Those buttons did not
exist.** Both validation pages were single `EmptyState` placeholders — 28 and 36 lines, no table, no
rows, no actions beyond "Retour à la file". There was no `validation/components/` directory.

The decision UI was therefore built, not wired. "Do not redesign the interface" is satisfied
trivially: it is composed entirely from existing primitives (`Card`, `Button`, `Alert`, `Badge`,
`SectionHeader`) and reuses the report and document cards already written for case detail.

### 1.2 Existing architecture evaluation

Sound and directly reusable. `Component → Hook → Service → Data source` was already established, with
two implementations behind a one-line binding in `services/index.ts`. This work extends that pattern
to a *command* path; no convention was changed.

**`CaseDecision` already existed** (`types/case.ts`), so per "do not duplicate existing domain models"
it was adapted rather than re-created.

### 1.3 Integration points

| Point | Reuse |
|---|---|
| Queue | `useAgentCases({ pendingDecision: true })` — existing hook, one new query flag |
| Case load | `useAgentCase(caseId)` — unchanged |
| Evidence display | `CompletenessReportCard`, `CoherenceReportCard`, `CaseDocumentsCard` — unchanged |
| States | `AsyncBoundary` — unchanged |
| Swap point | `services/index.ts` — one new binding beside the existing one |

## 2. Files modified

| File | Change |
|---|---|
| `src/types/case.ts` | `CaseDecision` adapted; `DecisionEvidence`, `DecisionOutcome` added |
| `src/features/agent/services/index.ts` | Export + bind `agentDecisionService` |
| `src/features/agent/hooks/index.ts` | Export `useCaseDecision` |
| `src/features/agent/components/CaseQueueTable.tsx` | `detailPath` / `actionLabel` props |
| `src/features/agent/validation/pages/ValidationQueuePage.tsx` | Live queue |
| `src/features/agent/validation/pages/ValidationDetailPage.tsx` | Full decision screen |

## 3. Files created

```
src/features/agent/
├── services/agentDecisionService.ts        ← contract + MissingEvidenceError + httpDecisionService
├── services/explanationService.ts          ← the Mistral seam (interface only, never UI-imported)
├── data/evidenceExtraction.ts              ← Case → DecisionEvidence[]
├── data/mockExplanationService.ts          ← deterministic template formulation
├── data/mockDecisionService.ts             ← orchestration + guard + persistence
├── hooks/useCaseDecision.ts                ← command hook
└── validation/components/
    ├── DecisionPanel.tsx                   ← Accepter / Rejeter
    ├── DecisionOutcomeCard.tsx             ← outcome + message + evidence with sources
    └── index.ts
```

## 4. Architecture decisions

**Domain vocabulary over wire vocabulary.** The brief specifies `"APPROVED" | "REJECTED"`. The
existing `CaseDecision.outcome` is `'validated' | 'rejected'`, matching `CaseStatus` exactly. Keeping
the lowercase form means a decision *is* its status transition (`caseRecord.status = decision.outcome`)
with no translation table. The uppercase form is a REST concern, mapped in `httpDecisionService` and
nowhere else.

**`evidence`, not `Case`, is the explanation input.** This is the load-bearing decision of the whole
design. Handed a `Case`, a model can reason about incomes, thresholds and entitlements, and produce
fluent unsupported claims — exactly the forbidden output in the brief. Handed a closed list of
extracted facts, the worst it can do is rephrase them. **The narrow input is the safety mechanism**,
and it is enforced by the type signature rather than by a prompt.

**Evidence extraction is reading, not analysis.** A document is missing because `received === false`,
not because `evidenceExtraction.ts` judged it important. Nothing is inferred, computed or weighted, so
the Agent Portal remains a consumer of processed cases and does not become a second decision engine.

**Citizen-facing wording lives next to the field it describes.** Each `DecisionEvidence.value` is
written as a sentence fragment at the point of extraction. Explanations concatenate them verbatim, so
wording can never drift from the fact through a downstream paraphrase.

**A rejection with no evidence is refused, not softened.** `MissingEvidenceError` is thrown before
anything is written or generated. The alternative — an empty evidence array and a vague message — is
precisely the unsupported reasoning the brief forbids.

**`explanationService` is deliberately not re-exported** from `services/index.ts`. It is the backend's
internal seam; making it reachable from the module every hook imports would turn "a component called
the explanation generator directly" into a one-line mistake instead of an impossible one.

## 5. Decision workflow implementation

### 5.1 What the queue contains

Every case still awaiting a decision — **not** only those the pipeline marked `ready_for_decision`.

Restricting it to that one status meant the validation queue held only clean cases, which are
precisely the ones that *cannot* be rejected: the rejection path was unreachable through the UI. A
case with missing pieces or unresolved anomalies is exactly the one an agent needs to reach.

The rule is expressed as a `pendingDecision` flag on `CaseQuery`, resolved server-side, rather than a
list of statuses named by the page. It is defined negatively — anything not `validated` or `rejected`
— so a future intermediate status joins the queue by default instead of silently vanishing from it,
the safer failure direction for a queue whose purpose is that nothing is forgotten. The same
predicate backs the dashboard counters, so the two cannot disagree.

```
Validation queue (pendingDecision)
        │  « Décider »
        ▼
ValidationDetailPage
   ├── completeness report  ─┐
   ├── coherence report      ├── the evidence, shown ABOVE the buttons
   ├── documents            ─┘
   ├── DecisionPanel        → Accepter / Rejeter
   └── DecisionOutcomeCard  → outcome · citizen message · evidence + sources
```

Reports appear above the decision panel deliberately: they are what the decision must rest on, and an
agent should read them before the buttons are in reach. `DecisionPanel` disappears once a decision
exists — the transition is one-way, and a live "Rejeter" beside a recorded approval invites a mistake
the backend would have to refuse anyway.

## 6. Service layer

```
DecisionPanel ─▶ useCaseDecision ─▶ agentDecisionService ─▶ mockDecisionService
   (gesture)      (state only)        (contract)               │
                                                               ├─▶ evidenceExtraction
                                                               └─▶ mockExplanationService
                                      httpDecisionService ─▶ apiClient ─▶ POST /agent/cases/{id}/decision
```

`useCaseDecision` is a **command** hook, separate from `useAsyncResource` on purpose: that hook models
a read that runs on mount; this models a write that runs on an agent's explicit gesture. Routing a
write through fetch-on-mount semantics is how a decision gets taken by a re-render.

The hook holds state and nothing else — it does not choose an outcome, extract evidence, compose a
message, or judge whether a rejection is permissible.

## 7. Mock workflow

`mockDecisionService` reproduces the server-side sequence in order, because that order is the contract
the real implementation must also honour:

1. load the case
2. extract evidence from it
3. **refuse a rejection that no evidence supports**
4. formulate the explanation from that evidence
5. persist decision + status transition

Steps 2–4 are backend work. Doing them in the browser is acceptable only because this is fixtures; at
cutover the chain moves behind the endpoint and `data/` is deleted.

Templates rather than a model, because a template engine *cannot* invent — so the mock demonstrates
the guarantee the real integration must preserve rather than merely imitating its output shape:

> **every claim in `message` comes from an item in `evidenceUsed`**

### Verified at runtime

| Scenario | Result |
|---|---|
| Reject 0355 (1 unusable doc, 2 missing, 2 anomalies) | 5 evidence items, all cited, all sourced |
| Reject 0392 (1 missing doc, 1 anomaly) | 2 evidence items |
| **Reject 0417 (clean case)** | **refused — `MissingEvidenceError`** |
| Approve 0417 | 2 supporting evidence items |
| Invariant: every evidence value appears verbatim in its message | OK on all three |
| Status transitions + queue drains to 0 | OK |

Deduplication is handled: a rejected document also shows as "not received" on the checklist, so the
more specific finding wins and the checklist entry is skipped — the same defect is never cited twice.

The AI score is deliberately **excluded** from citizen-facing evidence. It is an instruction aid, and
quoting a model's number back to someone as the reason for a decision about them is not a defensible
explanation.

## 8. Mistral integration strategy

Mistral replaces the body of `mockExplanationService` **server-side**. It receives the extracted
evidence list, never the `Case`.

| Mistral may | Mistral must never |
|---|---|
| Rephrase evidence into citizen-friendly French | Choose approval or rejection |
| Order and connect the supplied facts | Calculate eligibility or rights |
| Adjust register and tone | Infer or apply CAF rules |
| | Add any fact not in the evidence list |

The frontend must not know Mistral exists, and does not: no component, hook or service in `src/`
references it. The finished message arrives inside the decision response.

**What changes when the model arrives.** Today the invariant holds *structurally* — fixed template
text plus verbatim evidence, with no path for an unsupported sentence. Under a model it becomes a
prompt constraint that must be **tested**, not assumed. The runtime check already written (every
`evidenceUsed.value` appears in `message`) is too strict for a paraphrasing model and should become an
entailment check in the backend test suite. `DecisionOutcomeCard` is the human-facing half of the same
control: message and justification are shown together, so an unsupported sentence becomes visible.

## 9. Future REST API interaction

```
POST /agent/cases/{id}/decision
Request:  { "decision": "REJECTED" }
Response: { "decision": "REJECTED", "message": "…", "evidenceUsed": [ { field, value, source } ] }
```

Cutover:

1. Implement `apiClient.request()`.
2. Fill in `httpDecisionService` — one `apiClient.post` per method, plus DTO→domain mapping
   (`APPROVED`/`REJECTED` → `validated`/`rejected`, `message` → `explanation`).
3. Change one line in `services/index.ts`.
4. Delete `data/`.

No page, component or hook changes. The frontend does not gain a responsibility at cutover — it loses
one, since extraction and formulation move server-side.

## 10. Supabase / PostgreSQL strategy

```
Frontend ─▶ REST API ─▶ Decision Service ─▶ Mistral Service
                              │
                              ▼
                     PostgreSQL / Supabase
```

No UI component touches Supabase; the abstraction is `AgentDecisionService`.

Suggested persistence: a `decisions` table (`id`, `case_id`, `outcome`, `explanation`, `created_at`,
`decided_by`) with `evidence_used` as `jsonb` — it is an immutable audit snapshot of the facts as they
stood at decision time, not a live join. Recording it any other way means a later document upload
silently rewrites the justification of a past decision.

The decision write and the `cases.status` transition belong in **one transaction**; the mock's
`persist()` does both together for the same reason. Notification dispatch is a downstream consumer of
the committed decision row.

DTO/domain mapping lives in `httpDecisionService`, so a schema change touches one file.

## 11. Known gaps

- **Long rejections read poorly.** Case 0355 produces one sentence citing five findings. A model will
  fix this naturally; the template will not.
- **One generic anomaly template.** « l'information X déclarée (…) ne correspond pas à la pièce
  fournie (Non vérifié) » reads oddly when `observedValue` is an absence rather than a conflicting
  value. Worth a second template keyed on anomaly kind.
- ~~Decision state is per-screen.~~ **Fixed.** `ValidationDetailPage` now renders
  `controller.decision ?? caseRecord.decision`, so a case decided in an earlier visit shows its
  recorded outcome instead of appearing undecided.
- **No confirmation step** before rejection. Deliberate for now — but a real decision is
  citizen-affecting and irreversible, and should get one before production.
- **No auth**, so `decidedBy` is a constant. A real agent identity arrives with the auth module.
- **Not visually verified in a browser** — the Chrome extension is not connected. Verified by
  typecheck, production build, and runtime execution of the full workflow.
