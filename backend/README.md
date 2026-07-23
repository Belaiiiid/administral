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
