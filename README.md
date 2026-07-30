# MonParcours

Portail citoyen GovTech français. **Un compte, un profil citoyen, plusieurs services publics.**

Ce dépôt contient le frontend (React) **et** le backend (FastAPI/Python) : authentification,
assistant IA citoyen (RAG + Mistral), instruction de dossiers, contestations, audit, notifications…
Les deux projets sont indépendants, chacun avec ses propres dépendances et sa propre commande de
démarrage — il n'y a pas de `npm run` côté backend.

## Démarrage

Le dépôt est séparé en deux projets indépendants, `frontend/` et `backend/`.
Chacun possède ses propres dépendances ; la racine ne contient aucun outillage
de build.

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

| Script (depuis `frontend/`) | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production (typecheck inclus) |
| `npm run preview` | Prévisualisation du build |
| `npm run typecheck` | Vérification TypeScript seule |

### Backend

Le backend est en **Python** (FastAPI) — pas de Node/npm ici. Détails complets (base de données,
migrations, seed, variables d'environnement) dans [`backend/README.md`](backend/README.md).

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate         # Windows — macOS/Linux : source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # puis renseigner DATABASE_PASSWORD
alembic upgrade head
uvicorn app.main:app --reload  # http://localhost:8000
```

| | |
|---|---|
| API | http://localhost:8000/api |
| Swagger | http://localhost:8000/docs |
| Santé | http://localhost:8000/api/health |

### Voix (assistant vocal)

Aperçu
- STT : Whisper (VOICE_VENDOR=whisper) — ffmpeg non requis
- TTS : Mistral (VOICE_API_KEY requis)
- Onboarding après connexion : `/accessibilite-vocale`
- PTT : un seul blob final envoyé au backend
- Proxy Vite → backend : `http://127.0.0.1:8000`

#### Prérequis
- Backend : Python 3.11+, virtualenv. ffmpeg optionnel (requis si VOICE_VENDOR=mistral ou normalisation serveur). PostgreSQL optionnel pour l’historique chatbot.
- Frontend : Node 18+ (ou 20+). Autoriser l’accès micro dans le navigateur.

#### Backend — Installation
```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
# source .venv/bin/activate
pip install -r requirements.txt
```

#### Backend — Configuration (.env)
Créez `backend/.env` :

```dotenv
# STT (Whisper)
VOICE_VENDOR=whisper
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VOICE_STT_MODEL=whisper-1

# TTS (Mistral)
VOICE_API_KEY=mlt-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VOICE_BASE_URL=https://api.mistral.ai/v1
# Optionnels
# VOICE_TTS_MODEL=tts-mini
# VOICE_TTS_VOICE=male_fr

# Base de données (pour l’historique chatbot)
# DATABASE_URL=postgresql+psycopg2://USER:PASS@HOST:5432/DBNAME
```

Notes :
- VOICE_NLC_* non requis (classifieur serveur optionnel, désactivé par défaut).
- Avec Whisper, le backend envoie directement le WebM/Opus à l’API — ffmpeg n’est pas nécessaire.

#### Backend — Lancer
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

#### Base de données (optionnelle) — Alembic
Uniquement si vous activez l’historique chatbot.
```bash
alembic -c backend/alembic.ini upgrade head
```
Dépannage : erreur 500 « relation "chatbot_messages" does not exist » → appliquez la migration et vérifiez `DATABASE_URL`.

#### Frontend — Installation & lancement
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

#### Utiliser l’assistant vocal
1) Connectez‑vous → redirection vers `/accessibilite-vocale`.
2) Répondez « oui » pour activer l’assistant.
3) Ouvrez le panneau vocal (citoyen) et maintenez le bouton PTT 2–3 s en parlant.

#### Dépannage rapide
- 400 `audio_too_short` : enregistrement trop court (<0,1 s). Maintenez PTT ~2–3 s et parlez clairement.
- 200 OK sans texte : clip quasi silencieux ; recommencez plus près du micro.
- Aucun appel réseau sur PTT : permissions micro, aucun autre onglet/app n’utilise le micro.
- CORS/Proxy : backend sur `http://127.0.0.1:8000` (évitez `localhost`).

## Stack

**Frontend** — React 18 · TypeScript · Vite 6 · Tailwind CSS 3 · Radix UI (primitives de style
shadcn/ui) · React Router 6 · Zustand · lucide-react

**Backend** — Python · FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL · Pydantic v2 · LangGraph ·
Mistral (LLM) · sentence-transformers / Qdrant / BM25 (RAG hybride)

## Structure

```
MonParcours/
├── frontend/          Application React (voir ci-dessous)
├── backend/           API FastAPI/Python (voir backend/README.md)
├── docs/              Documentation d'architecture
└── README.md
```

L'organisation interne du frontend est inchangée :

```
frontend/src/
├── app/               Composition de l'application
│   ├── config/        Identité, registre des services, navigation
│   ├── providers/     Racine de composition des providers
│   └── router/        Routes, chemins, garde d'accès
├── components/
│   ├── ui/            Primitives du design system
│   ├── layout/        Coquilles applicatives
│   └── shared/        Composants transverses issus des maquettes
├── features/          Modules isolés (portal, apl, profile, documents, chatbot, agent, auth)
├── hooks/             Hooks réutilisables
├── services/          Contrats d'API (interfaces uniquement)
├── store/             État global Zustand (UI + session)
├── types/             Types partagés
└── index.css          Tokens de design en variables CSS
```

**Règle d'isolation** : un module `features/*` n'importe jamais depuis un autre module `features/*`.

## Documentation

- [`docs/design-analysis.md`](docs/design-analysis.md) — analyse des 13 maquettes, design system
  extrait, décisions et arbitrages.
- [`docs/roadmap.md`](docs/roadmap.md) — état actuel, points d'attention et ordre de construction.

## Ajouter un service public

1. Ajouter l'entrée dans `frontend/src/app/config/services.ts`.
2. Créer `frontend/src/features/<service>/pages/`.
3. Déclarer les routes dans `frontend/src/app/router/index.tsx`.

La coquille (header, sidebar, footer, garde d'accès) n'a pas à être modifiée.

## États vides

Aucune donnée n'est simulée. Les pages ne contiennent que la mise en page : chaque collection est
déclarée vide et rend son état vide (`<EmptyState />`), et chaque valeur inconnue rend un tiret
neutre annoncé « Non renseigné » (`<DataRow label="…" />` sans `value`).

Pour brancher un service, remplacez la constante vide en tête de page — le rendu de l'état plein est
déjà écrit à côté de l'état vide.

## Accessibilité

Cible **RGAA**. Le socle fournit : lien d'évitement, focus visible non supprimable, structure
sémantique (`header`/`nav`/`main`/`footer`, un seul `h1` par page), `aria-hidden` sur les icônes
décoratives, `aria-current` sur la navigation, cibles tactiles de 44px minimum, et sept préférences
d'accessibilité fonctionnelles (contraste élevé, texte agrandi, focus renforcé, animations réduites)
persistées et appliquées via `<html class="a11y-*">`.
