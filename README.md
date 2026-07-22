# MonParcours

Portail citoyen GovTech français. **Un compte, un profil citoyen, plusieurs services publics.**

Ce dépôt contient le **socle frontend** : structure, design system, layouts, squelettes de pages et
routage. Il ne contient **aucune logique métier** — backend, authentification, assistant IA et
intégrations administratives seront ajoutés comme modules full-stack indépendants.

## Démarrage

Le dépôt est séparé en deux projets indépendants, `frontend/` et `backend/`.
Chacun possède ses propres dépendances ; la racine ne contient aucun outillage
de build.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

`backend/` est actuellement vide — voir [`backend/README.md`](backend/README.md).

| Script (depuis `frontend/`) | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production (typecheck inclus) |
| `npm run preview` | Prévisualisation du build |
| `npm run typecheck` | Vérification TypeScript seule |

## Stack

React 18 · TypeScript · Vite 6 · Tailwind CSS 3 · Radix UI (primitives de style shadcn/ui) ·
React Router 6 · Zustand · lucide-react

## Structure

```
MonParcours/
├── frontend/          Application React (voir ci-dessous)
├── backend/           Vide — aucun code serveur à ce stade
├── docs/              Documentation d'architecture
├── design-preference/ Maquettes de référence
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
# MonParcours
