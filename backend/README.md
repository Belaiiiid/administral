# MonParcours — API

FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL · Pydantic v2

Monolithe modulaire. Chaque module expose son routeur et suit la même
séparation : **router → service → repository → PostgreSQL**.

---

## Démarrage local

### 1. Environnement virtuel et dépendances

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows
# source .venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
```

> Utilisez l'environnement virtuel. Une installation globale écrase les
> versions de paquets utilisées par vos autres projets.

### 2. Configuration

```bash
cp .env.example .env
```

Renseignez `DATABASE_PASSWORD` avec le mot de passe de votre PostgreSQL local.
`.env` est gitignoré et ne doit jamais être commité.

### 3. Base de données

```bash
psql -U postgres -c "CREATE DATABASE monparcours;"
```

> **Windows** : l'installeur PostgreSQL n'ajoute pas toujours `psql` au `PATH`.
> Si `psql: command not found`, appelez le binaire par son chemin complet
> (`"C:\Program Files\PostgreSQL\<version>\bin\psql.exe"`) ou ajoutez ce
> dossier au `PATH` de votre compte, puis rouvrez le terminal.

### 4. Migrations

```bash
alembic upgrade head
```

### 5. Données de démonstration (optionnel)

```bash
.venv/Scripts/python -m scripts.seed
```

⚠️ Données **synthétiques**. Identités inventées, e-mails en `.test`, NIR non
attribués. À ne jamais charger dans un environnement contenant des données
réelles.

### 6. Démarrage

```bash
uvicorn app.main:app --reload
```

| | |
|---|---|
| API | http://localhost:8000/api |
| Swagger | http://localhost:8000/docs |
| Santé | http://localhost:8000/api/health |

---

## Structure

```
backend/
├── app/
│   ├── main.py                 Composition : CORS, routeurs, lifespan
│   ├── core/
│   │   ├── config.py           Variables d'environnement (pydantic-settings)
│   │   ├── security.py         Masquage NIR ; emplacement du garde d'auth
│   │   └── exceptions.py       Erreurs domaine → réponses HTTP
│   ├── database/
│   │   ├── base.py             DeclarativeBase + horodatages
│   │   ├── session.py          Engine, session par requête, santé
│   │   └── models.py           Registre des modèles (requis par Alembic)
│   ├── modules/
│   │   ├── agent/              ✅ implémenté
│   │   │   ├── router.py       HTTP uniquement
│   │   │   ├── service.py      Règles métier
│   │   │   ├── repository.py   Requêtes SQL uniquement
│   │   │   ├── models.py       Entités SQLAlchemy
│   │   │   └── schemas.py      Objets Pydantic
│   │   ├── auth/               placeholder
│   │   ├── citizen/            placeholder
│   │   ├── services/apl/       placeholder
│   │   └── ai/{chatbot,rag,agents}/  placeholder
│   └── utils/
├── alembic/versions/           Migrations
├── scripts/seed.py             Données de développement
├── tests/
└── requirements.txt
```

### Rôle de chaque couche

| Couche | Fait | Ne fait pas |
|---|---|---|
| `router.py` | Parse la requête, appelle le service, renvoie la réponse | Aucune règle métier |
| `service.py` | Règles, orchestration, mapping vers les schémas | Aucun SQL |
| `repository.py` | Requêtes SQLAlchemy | Aucune décision métier |
| `models.py` | Entités persistées | — |
| `schemas.py` | Contrat d'entrée/sortie | — |

Le test : une règle qui doit rester cohérente entre deux endpoints appartient au
service. `UNDECIDED_STATUSES` en est l'exemple — la file de validation et les
compteurs du tableau de bord la partagent, donc ils ne peuvent pas diverger.

---

## Endpoints

| Méthode | Chemin | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness + accessibilité PostgreSQL (503 si injoignable) |
| `GET` | `/api/agent/cases` | File d'instruction. Filtres : `status`, `search`, `pendingDecision` |
| `GET` | `/api/agent/cases/stats` | Compteurs de charge de travail |

Les réponses sont en **camelCase** : elles correspondent champ pour champ à
`frontend/src/types/case.ts`, que le frontend consomme directement.

### ⚠️ Aucune authentification

Les endpoints `/api/agent/*` exposent des données de dossiers et ne sont pas
protégés. Le garde d'authentification a sa place dans `core/security.py`, en
dépendance de routeur. À brancher avant tout déploiement partagé.

---

## Déploiement de l'assistant citoyen

`POST /api/citizen/chatbot/message` est le seul endpoint public dont chaque appel
coûte de l'argent à un tiers. Trois réglages décident s'il est réellement borné,
et leurs valeurs par défaut ne conviennent qu'en développement.

### ⚠️ Un seul worker uvicorn

Le magasin vectoriel embarqué (Qdrant) verrouille son dossier : un deuxième
processus ne peut pas l'ouvrir et tourne silencieusement en BM25 seul. Les
compteurs de débit (`core/rate_limit.py`) sont en mémoire et ont donc exactement
la même portée : **`--workers 2` multiplie silencieusement toutes les limites par
deux**, et le disjoncteur de dépense par autant.

Le jour où Qdrant passera en mode serveur, ces compteurs devront déménager dans
Redis **le même jour**, sinon la limitation devient décorative.

### ⚠️ Le disjoncteur de dépense est éteint par défaut

`CHATBOT_BUDGET_JETONS_PAR_JOUR` vaut `0` tant que personne ne le fixe, et `0`
signifie *aucun plafond global*. Les quotas par appelant continuent de
s'appliquer, mais ils bornent ce qu'UNE personne demande, pas le total : mille
appelants dans leur droit coûtent mille fois le quota.

Le défaut est délibéré — on n'arrête pas un service sur un seuil que personne n'a
choisi — mais il faut donc le choisir. Laissez tourner quelques jours, lisez
`assistant.jetons_jour` sur `GET /api/health`, et fixez le plafond au-dessus du
maximum observé.

### ⚠️ `TRUST_PROXY_HEADERS` doit correspondre à la topologie

Il décide à qui l'on compte une requête anonyme, et les deux erreurs sont
symétriques :

| Réglage | Sans proxy devant | Derrière un proxy |
|---|---|---|
| `0` (défaut) | correct | toutes les requêtes portent l'IP du proxy : **les citoyens se bloquent mutuellement** |
| `1` | `X-Forwarded-For` est un simple en-tête : **quota neuf à chaque requête** | correct |

### Point de contrôle

`GET /api/health` rend, sous `assistant` : `mode_recherche` (`hybride` /
`bm25_seul` / `non_initialise`), `jetons_jour`, `appels_jour`, `budget`,
`suspendu`. `mode_recherche` ne fait **pas** basculer le statut HTTP : en BM25
seul l'assistant répond toujours, avec ses sources, simplement moins bien —
retirer le service du trafic remplacerait des réponses dégradées par pas de
réponse du tout. C'est à surveiller et à alerter, pas un signal de vie.

Toutes les variables et leurs valeurs par défaut sont dans
[`.env.example`](.env.example), section *Citizen AI Assistant*.

---

## Contrat avec le frontend

Le frontend déclarait l'API avant que ce backend existe
(`frontend/src/services/`, `frontend/src/features/*/services/`). Ces interfaces
sont la spécification, pas une conséquence.

Le seed reproduit exactement les fixtures de
`frontend/src/features/agent/data/fixtures.ts`. Tant que le frontend affiche ses
mocks, basculer un binding de service du mock vers HTTP ne doit **rien** changer
à l'écran. Toute différence visible est une vraie divergence de contrat.

---

## Ajouter un module

1. `app/modules/<nom>/` avec `router.py`, `service.py`, `repository.py`,
   `models.py`, `schemas.py`.
2. Importer ses modèles dans `app/database/models.py` — **sinon Alembic
   autogenerate ne les voit pas et génère une migration qui supprime ses
   tables**.
3. `app.include_router(...)` dans `app/main.py`.
4. `alembic revision --autogenerate -m "add <nom>"` puis relire le fichier
   généré avant de l'appliquer.

---

## Voix (STT/TTS) — passerelle minimale

Deux endpoints sont exposés pour la dictée (STT) et la synthèse vocale (TTS).

| Méthode | Chemin                    | Corps                         | Réponse |
|---|---|---|---|
| `POST` | `/api/voice/transcribe`   | `multipart/form-data` avec `file` (audio webm/ogg/wav) | `{ "text": "…" }` |
| `POST` | `/api/voice/speak`        | JSON `{ "text": "…" }`      | `audio/wav` (octets) |

Exemples rapides

```bash
# Transcription (webm ou wav). Remplacez sample.webm par votre fichier
curl -sS -F file=@sample.webm http://localhost:8000/api/voice/transcribe | jq

# Synthèse (retourne un WAV)
curl -sS -X POST http://localhost:8000/api/voice/speak \
  -H 'Content-Type: application/json' \
  -d '{"text":"Bonjour, comment puis-je vous aider ?"}' \
  --output out.wav
```

Configuration requise (`.env`)

- `VOICE_API_KEY` — clé API Mistral (ou fournisseur compatible)
- `VOICE_BASE_URL` — par défaut `https://api.mistral.ai/v1`
- `VOICE_STT_MODEL` — ex. `voxtral-mini-latest`
- `VOICE_TTS_MODEL` — ex. `voxtral-mini-tts-latest`
- `VOICE_TTS_VOICE` — ex. `fr_marie_neutral`

Conseillé : installez `ffmpeg` localement. Le backend transcode si besoin (webm/ogg → wav, 16 kHz mono) et supprime les silences de tête.
