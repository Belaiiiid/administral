# MonParcours — Technology Stack & AI Models

Reference for the demo. Everything below is what actually runs in the codebase.

---

## Architecture at a glance

**Modular monolith.** React SPA ⇄ FastAPI (one process, feature-sliced) ⇄ PostgreSQL.
AI is layered in as analysis stages and assistants — **Mistral** is the single LLM
provider across every feature; retrieval uses a local embeddings model.

```
React (Vite) ──HTTP /api──▶ FastAPI ──SQLAlchemy──▶ PostgreSQL
                              │
                              ├─ LangGraph agents (profiling, chatbot)
                              ├─ Mistral API (classification, OCR, coherence, fraud, generation)
                              └─ BM25 + Qdrant (RAG retrieval) · sentence-transformers (embeddings)
```

---

## Frontend

| Concern | Technology | Version |
|---|---|---|
| UI library | **React** | 18.3 |
| Build / dev server | **Vite** | 6.0 |
| Language | **TypeScript** (strict) | 5.7 |
| Styling | **Tailwind CSS** | 3.4 |
| Components | **Radix UI** primitives (shadcn/ui pattern) | 1.x–2.x |
| State | **Zustand** (session, UI, profiling stores) | 5.0 |
| Routing | **React Router** (lazy, code-split routes) | 6.28 |
| Icons / utils | lucide-react, clsx, tailwind-merge | — |

## Backend

| Concern | Technology | Version |
|---|---|---|
| Web framework | **FastAPI** | 0.115 |
| ASGI server | **uvicorn** | 0.34 |
| ORM | **SQLAlchemy** | 2.0 |
| Database | **PostgreSQL** (psycopg2) | 2.9 driver |
| Migrations | **Alembic** | 1.14 |
| Validation / config | **Pydantic** 2.10 + pydantic-settings | — |
| Auth | **JWT** (python-jose, HS256) + **bcrypt** password hashing | — |
| HTTP client (LLM calls) | **httpx** | 0.28 |
| Uploads | python-multipart | — |

## Document processing

| Stage | Technology |
|---|---|
| Native PDF text extraction | **pypdf** 5.1, **pdfplumber** 0.11 |
| Scanned-document OCR | **Mistral OCR** (`mistral-ocr-latest`) |
| Metadata forensics (fraud) | deterministic PDF/image metadata + LLM |

## AI orchestration & RAG

| Concern | Technology | Version |
|---|---|---|
| Agent orchestration | **LangGraph** (profiling loop **and** chatbot intent graph) | 0.2.62 |
| Lexical retrieval | **BM25** (rank-bm25) | 0.2.2 |
| Vector retrieval | **Qdrant** (embedded local store) | 1.18 |
| Fusion | **Reciprocal Rank Fusion** (RRF, k=60) | — |
| Embeddings | **sentence-transformers** | 5.6 |
| LLM SDK (chatbot) | **mistralai** | 2.7.1 |

---

## AI Models

Every generative/analytic model is **Mistral** (one provider, one key). Retrieval
embeddings run **locally** (no API, no key).

| Feature | Model | Why this model |
|---|---|---|
| **Citizen Profiling** (adaptive interview) | `mistral-medium-latest` | Balanced reasoning for the turn-by-turn cascade |
| **Coherence analysis** (declared vs documents) | `mistral-medium-latest` | Judgement over multi-document evidence |
| **Document classification** (vs checklist) | `mistral-small-latest` | Fast, cheap on one already-extracted doc |
| **OCR** (scanned documents) | `mistral-ocr-latest` | Dedicated OCR model |
| **Fraud forensics** (Agent C4) | `mistral-large-latest` | Subtle metadata inconsistencies = reasoning task |
| **Chatbot — intent routing** | `mistral-small-latest` | Cheap JSON classification into 4 intents |
| **Chatbot — answer generation** (RAG) | `mistral-small-latest` | Grounded generation over retrieved passages |
| **RAG embeddings** (query + corpus) | `paraphrase-multilingual-MiniLM-L12-v2` | Light, multilingual (FR), 384-dim, runs locally |

*Models are configurable via `backend/.env` (`MISTRAL_MODEL`, `MISTRAL_FRAUD_MODEL`,
`MISTRAL_CLASSIFIER_MODEL`, `MISTRAL_OCR_MODEL`); the table shows the defaults.*

---

## AI features → how they work

- **Profiling assistant** — LangGraph loop; Mistral picks the next question, a
  deterministic harness enforces the APL rule cascade, completeness (A4) and a
  12-turn cap. Mistral-only (no silent fallback).
- **Completeness** — deterministic, derived from the personalised checklist at submission.
- **Coherence** — deterministic OCR/readability check + Mistral cross-document
  analysis → 0–100 score + anomalies + AI explanation. Fail-safe (degrades to
  *à revoir*, never blocks submission).
- **Fraud (C4)** — deterministic metadata signals (dates, producing software) +
  Mistral-large contextual verdict. Runs **asynchronously** after submission so the
  citizen is not made to wait; never blocks.
- **Citizen AI Assistant (RAG)** — the migrated APL RAG: LangGraph intent router →
  hybrid **BM25 + Qdrant** retrieval → **RRF** fusion → grounded Mistral answer with
  **source citations**. Conversation memory (multi-turn). General APL → RAG; dossier
  questions → MonParcours services.

## Data & auth

- **PostgreSQL** — citizens, users, applications/documents/checklist, cases,
  completeness/coherence reports, decisions. Alembic migrations.
- **JWT auth** — HS256, short-lived tokens; roles CITIZEN / AGENT / ADMIN; bcrypt hashes.
- **RAG corpus** — 42 chunks from official CAF / service-public.fr APL sources, indexed
  into BM25 + Qdrant (rebuilt from the committed chunks at startup).
