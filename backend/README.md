# backend

Placeholder. **No backend code exists in this repository yet.**

This directory was created during the `frontend/` / `backend/` separation so the
split is in place before backend work starts. It is deliberately empty rather
than pre-scaffolded: the stack has not been chosen, and guessing at one produces
configuration that has to be deleted before the real thing can be written.

## What the frontend expects

The frontend already describes the API it will call, in interface form. Those
contracts are the specification for whatever gets built here — each declares its
future endpoint in a docblock, and each currently throws `notImplemented`:

| Contract | File (under `frontend/`) | Endpoints named |
| --- | --- | --- |
| `AgentCaseService` | `src/features/agent/services/agentCaseService.ts` | `GET /agent/cases`, `GET /agent/cases/{id}`, `GET /agent/cases/stats` |
| `AgentDecisionService` | `src/features/agent/services/agentDecisionService.ts` | case approval / rejection |
| `ChatbotService` | `src/features/chatbot/services/chatbotService.ts` | `POST /citizen/chatbot/message` |
| `AplService`, `ProfileService`, `DocumentService`, `PortalService` | `src/services/` | citizen-side reads and writes |

`frontend/src/services/apiClient.ts` is the single HTTP entry point; its
`request()` is unimplemented and is where the base URL and auth headers belong.

## When code lands here

Add `package.json` (or the equivalent for the chosen stack) in this directory.
Nothing at the repository root needs to change — the root holds no build tooling,
and `frontend/` and `backend/` are independent projects with their own installs.
