# MonParcours — Revue d'architecture frontend

> Phase 1 du chantier de plateformisation. Ce document décrit **l'existant tel qu'il est**,
> pas la cible. La cible et la stratégie de migration sont en §7 et §8.
>
> Date : 2026-07-21 · Périmètre : `src/` (90 fichiers, ~0 dépendance métier)

---

## 1. Vue d'ensemble de l'architecture actuelle

**Application unique, monolithe modulaire.** Il n'y a ni monorepo, ni workspaces, ni packages.
Une seule `package.json`, un seul `vite.config.ts`, un seul `tsconfig.json`, un seul point
d'entrée (`src/main.tsx`).

| Aspect | État |
|---|---|
| Build | Vite 6 + `@vitejs/plugin-react` |
| Langage | TypeScript 5.7, `strict: true`, `noUnusedLocals`, `noUnusedParameters` |
| Framework | React 18.3 |
| Routage | `react-router-dom` 6.28, `createBrowserRouter`, lazy par route |
| État | Zustand 5 (`uiStore` persisté, `sessionStore` inerte) |
| Styles | Tailwind 3.4 + tokens CSS custom, `tailwindcss-animate` |
| Primitives | Radix UI (13 packages) + `class-variance-authority` |
| Icônes | `lucide-react` |
| Alias | `@/*` → `./src/*` (déclaré **deux fois** : `vite.config.ts` et `tsconfig.json`) |
| Tests | ❌ aucun |
| Lint | Script `lint: eslint .` déclaré, **mais aucune config ESLint ni dépendance ESLint installée** |
| CI | ❌ aucune |
| Versionnement | ❌ **le dossier n'est pas un dépôt git** |

### Découpage des dossiers

```
src/
├── main.tsx                 point d'entrée
├── index.css                tokens CSS + classes d'accessibilité
├── app/                     composition racine
│   ├── config/              app.ts · navigation.ts · services.ts
│   ├── providers/           AppProviders.tsx
│   └── router/              index.tsx · paths.ts · ProtectedRoute.tsx · RouteFallback.tsx
├── components/
│   ├── ui/                  21 primitives (button, card, table, dialog…)
│   ├── shared/              10 composants composites (Stepper, Timeline, StatusBadge…)
│   └── layout/              AppShell · AuthLayout · FocusLayout · Header · Sidebar · Footer · Logo · SkipLink
├── features/                7 modules métier
│   ├── portal/              4 pages (dashboard citoyen, services, notifications, 404)
│   ├── apl/                 4 pages (accueil, simulateur, formulaire, détail)
│   ├── auth/                2 pages + FranceConnectButton
│   ├── documents/           2 pages
│   ├── profile/             2 pages + accessibilityOptions.ts
│   ├── chatbot/             1 page + AssistantWidget
│   └── agent/               1 page (placeholder assumé)
├── hooks/                   useAccessibilityPreferences · useDocumentTitle · useMediaQuery
├── services/                apiClient + 5 services (tous non implémentés)
├── store/                   sessionStore · uiStore
├── types/                   7 modules de types
└── lib/                     utils.ts (cn, formatEuros, formatDate, getInitials)
```

---

## 2. Frontières applicatives existantes

**Il n'existe aujourd'hui qu'une seule application.** Le portail agent n'est pas une application :
c'est une branche du même routeur, servie par le **même** `AppShell`, la même `Sidebar`, le même
bundle.

Dans `src/app/router/index.tsx`, quatre zones sont déclarées :

| Zone | Layout | Garde | Routes |
|---|---|---|---|
| Entrée | `AuthLayout` | — | `/connexion`, `/inscription` |
| Onboarding | `FocusLayout` | — | sélection de services, accessibilité |
| Citoyen | `AppShell` | `<ProtectedRoute />` | 11 routes |
| Agent | `AppShell` | `<ProtectedRoute role="agent" />` | 1 route (`/agent`) |
| 404 | aucun | — | `*` |

**Constat clé :** la séparation citoyen/agent est une *convention de routage*, pas une frontière
architecturale. Concrètement :

- `AGENT_NAV` est défini dans `app/config/navigation.ts` mais **n'est jamais consommé** —
  `Sidebar.tsx` ne lit que `PRIMARY_NAV` et `SECONDARY_NAV`. Un agent connecté voit donc
  aujourd'hui la navigation citoyenne (« Mes demandes », « Simulateur APL », « Nouvelle demande »).
- La route `/agent` est de fait inatteignable : `sessionStore` renvoie `role: 'citizen'` en dur.
- `AgentDashboardPage.tsx` affiche lui-même un bandeau « Écran provisoire » — aucune maquette
  agent n'existe (`docs/design-analysis.md` §1.4).

C'est la faiblesse structurelle n°1, et c'est exactement ce que la Phase 4 doit corriger.

### Registre de services

`app/config/services.ts` est le point d'extension délibéré de la plateforme :

```ts
SERVICES = [
  { id: 'caf',               basePath: '/apl',               status: 'available'  },
  { id: 'france-travail',    basePath: '/france-travail',    status: 'coming_soon' },
  { id: 'assurance-maladie', basePath: '/assurance-maladie', status: 'coming_soon' },
  { id: 'impots',            basePath: '/impots',            status: 'coming_soon' },
]
```

Trois des quatre administrations sont déclarées mais n'ont **ni module `features/`, ni route**.
Le registre décrit donc une intention, pas un état. C'est acceptable — mais cela signifie que la
promesse « ajouter une administration = ajouter un module » n'a jamais été testée en pratique.

**Incohérence de nommage à trancher :** l'identifiant du service est `caf`, le dossier est
`features/apl/`, le `basePath` est `/apl`, et la cible demandée en Phase 3 est `services/apl/`.
`caf` (l'administration) et `apl` (la prestation) ne sont pas synonymes — la CAF sert aussi le RSA,
la prime d'activité, les allocations familiales. Il faut décider si l'unité de modularité est
**l'administration** ou **la prestation**, puis nommer de façon cohérente. Recommandation :
l'administration (`caf`), avec les prestations en sous-modules — sinon un futur module RSA
dupliquera toute la couche d'identité CAF.

---

## 3. Analyse de l'organisation des composants

Trois couches, avec une hiérarchie claire et globalement respectée :

**`components/ui/` — 21 primitives.** Pattern shadcn/ui : wrapper Radix + `cva` pour les variantes.
Sans dépendance métier. Directement extractibles vers `packages/ui/`.

**`components/shared/` — 10 composites.** `AiSuggestionCard`, `CircularProgress`, `DataRow`,
`Dropzone`, `EmptyState`, `PageHeader`, `SectionHeader`, `StatusBadge`, `Stepper`, `Timeline`.
Couche intermédiaire saine. **Mais** : `StatusBadge` consomme le type `ProcessStatus` de
`@/types/common`, et `AiSuggestionCard` porte une sémantique « suggestion IA ». Ces deux-là ne
sont pas neutres au sens strict — leur extraction vers `packages/ui/` impose de sortir aussi les
types associés, sinon `ui` dépendra de `shared-types` (ce qui est acceptable, mais doit être
décidé explicitement, pas subi).

**`components/layout/` — 8 composants.** `AppShell`, `AuthLayout`, `FocusLayout` sont les trois
coquilles. **`Sidebar.tsx` est le point de couplage le plus dur du dépôt** : il importe
`PRIMARY_NAV`/`SECONDARY_NAV` en dur et code en dur le bouton « Nouvelle demande » pointant vers
`ROUTES.aplApplication`. Un composant de layout référence donc directement une route APL. C'est
la ligne exacte qui empêche de réutiliser le shell pour le portail agent.

**Qualité générale :** élevée. Accessibilité traitée sérieusement (`aria-hidden` sur les icônes
décoratives, `aria-label` sur les boutons-icônes, `sr-only` sur les libellés, `<caption>` sur les
tableaux, skip-link, focus visible, `aria-current="page"`). Les commentaires expliquent le
*pourquoi* et non le *quoi* — `lib/utils.ts` documente précisément pourquoi `extendTailwindMerge`
est nécessaire. Aucun composant monolithique : le plus gros fichier fait 9,8 Ko.

---

## 4. Analyse des dépendances

### Graphe interne

```
features/*  ──→  components/{ui,shared,layout}
            ──→  hooks/  ──→  store/
            ──→  services/  ──→  types/
            ──→  app/router/paths  ·  app/config/*
            ──→  lib/utils

components/layout  ──→  app/config/navigation  ──→  app/router/paths   ⚠️ layout → app
components/shared  ──→  types/                                          ⚠️ ui → types
app/router         ──→  features/*  (lazy)                              ✅ sens correct
```

**La règle d'isolation est tenue :** aucun `features/*` n'importe depuis un autre `features/*`.
C'est le point le plus important, et il est respecté — la migration vers un monorepo en devient
nettement moins risquée.

**Deux inversions à corriger avant l'extraction :**

1. `components/layout/Sidebar.tsx` → `app/config/navigation.ts` → `app/router/paths.ts`.
   La couche présentation dépend de la couche composition. Dans un monorepo, `packages/ui` ne
   peut pas dépendre d'une application. **Correctif : la navigation doit être injectée en prop,
   pas importée.** C'est le prérequis n°1 de la Phase 5.
2. `components/shared/StatusBadge.tsx` → `@/types/common`. Résolu naturellement par
   `packages/shared-types`, à condition d'assumer `ui → shared-types`.

### Dépendances externes

23 dépendances de production, aucune superflue, aucune obsolète. Le poids est concentré sur
Radix (13 packages ciblés, tree-shakables).

**Manques notables** — tous cohérents avec un socle assumé comme inerte, mais tous bloquants pour
un monorepo de production :

| Absent | Conséquence |
|---|---|
| ESLint (config + deps) | Le script `lint` **échoue**. Aucune règle de frontière ne peut être appliquée. |
| Vitest / Testing Library | Aucun filet lors du déplacement de 90 fichiers. |
| `react-hook-form` + `zod` | Les formulaires (simulateur, demande) sont des coquilles. |
| TanStack Query | Risque de voir l'état serveur atterrir dans Zustand. |
| i18n | Le français est codé en dur dans chaque composant. |
| Prettier | Formatage non verrouillé. |

---

## 5. Forces

1. **L'architecture feature-based existe déjà.** La Phase 3 n'est pas une refonte, c'est un
   déplacement. `features/apl/pages/…` → `services/apl/pages/…` est une opération mécanique.
2. **L'isolation inter-modules est réellement respectée** (vérifiée fichier par fichier).
3. **Code-splitting systématique** au niveau route — 17 routes, 17 chunks lazy.
4. **Design system cohérent et tokenisé.** Aucune couleur littérale hors identité RF. La
   contrainte « ne pas redessiner l'UI » est donc tenable sans effort : les tokens vivent dans
   `index.css` + `tailwind.config.ts`, il suffit de les déplacer intacts.
5. **Accessibilité traitée en amont**, pas rajoutée après coup. Les préférences (`highContrast`,
   `largeText`, `keyboardNavigation`, `simplifiedInterface`) sont fonctionnelles et persistées,
   projetées sur `<html>` par `useAccessibilityPreferences`.
6. **TypeScript strict**, sans `any` de complaisance.
7. **Aucune donnée fictive.** Chaque page part d'une collection vide et rend un état vide. C'est
   une décision explicite du `roadmap.md` (§5) qui évite de masquer l'absence de backend — et qui
   rend la validation post-migration beaucoup plus simple (l'écran attendu est déterministe).
8. **Documentation d'intention déjà présente** (`docs/roadmap.md`, `docs/design-analysis.md`).

---

## 6. Faiblesses, dette technique et limites de scalabilité

Classées par gravité pour le chantier de plateformisation.

### Bloquants

| # | Problème | Impact |
|---|---|---|
| B1 | **Pas de dépôt git.** | Déplacer 90 fichiers sans historique ni possibilité de retour arrière. **À corriger avant toute autre action.** |
| B2 | **Aucun test.** | Aucun moyen de prouver qu'une migration de 90 fichiers n'a rien cassé, au-delà de `tsc` et d'une revue visuelle. |
| B3 | **`lint` est cassé** (script déclaré, ESLint absent). | Impossible d'outiller les règles de frontière (`no-restricted-imports`) qui font tenir un monorepo dans le temps. |
| B4 | **Le portail agent n'existe pas** — 1 page placeholder, sans maquette, servie par le shell citoyen, avec `AGENT_NAV` mort. | La Phase 4 est une création, pas une migration. À budgéter comme telle. |

### Structurels

| # | Problème | Impact |
|---|---|---|
| S1 | `Sidebar` importe la navigation et une route APL en dur. | Empêche l'extraction du layout vers `packages/ui`. Prérequis de la Phase 5. |
| S2 | `sessionStore` est inerte (`isAuthenticated: true`, `role: 'citizen'` en dur). | La garde de rôle n'est pas testable. Deux portails séparés rendent l'authentification **critique**, plus optionnelle. |
| S3 | Modèle d'habilitation binaire (`citizen | 'agent'`). | Ne survivra pas à plusieurs administrations : un agent CAF ne doit pas voir les dossiers DGFiP. Il faut des permissions par service, pas un rôle global. |
| S4 | Ambiguïté `caf` / `apl` (cf. §2). | Nommage à trancher **avant** de créer `services/`, sinon la dette se fige. |
| S5 | Français codé en dur dans tous les composants. | Coût d'extraction croissant à chaque écran ajouté. |
| S6 | Alias `@/*` dupliqué (Vite + tsconfig). | En monorepo cette duplication se multiplie par le nombre de packages. À centraliser dans `packages/config`. |
| S7 | `services/` (couche HTTP) et `services/` (modules administration, Phase 3) : **collision de nom**. | Deux concepts sans rapport sous le même mot. À renommer avant la migration. |

### Limites de scalabilité

- **Le registre de services n'a jamais été exercé.** 3 des 4 administrations déclarées n'ont pas
  de module. La promesse d'extensibilité est théorique tant qu'un second module n'a pas été créé.
- **Bundle unique.** Citoyens et agents partagent aujourd'hui le même artefact de build — un
  déploiement agent redéploie le portail citoyen, et un citoyen télécharge (en lazy, mais dans le
  même déploiement) du code back-office. Séparation nécessaire pour des raisons de sécurité
  autant que de performance.
- **Aucune frontière outillée.** Les règles du `roadmap.md` (§Conventions) sont écrites mais rien
  ne les vérifie. Sans ESLint, un import `features/apl` → `features/documents` passerait la revue.

---

## 7. Recommandation de cible

La cible demandée (`apps/{citizen,agent}-portal` + `packages/{ui,core,shared-types,api-client,config}`)
est la bonne destination. **Une réserve importante sur le calendrier :**

Le dépôt fait aujourd'hui ~90 fichiers, sans tests, sans lint, sans git, sans backend. Passer
immédiatement à 2 applications + 5 packages, c'est multiplier par 7 le nombre de `package.json`,
de `tsconfig.json` et de graphes de build **avant** d'avoir le filet de sécurité qui rend ce
niveau de découpage tenable. Le risque n'est pas la destination, c'est l'ordre.

**Recommandation : traiter les bloquants B1→B3 en préalable (moins d'une journée), puis migrer.**
Le détail est en §8.

Sur l'outillage : **npm workspaces + Vite** suffit à ce volume. Turborepo/Nx apportent du cache
de build distant et de l'orchestration de tâches dont un dépôt de 90 fichiers n'a pas l'usage ;
ils peuvent être ajoutés plus tard sans rien restructurer. Ne pas les introduire maintenant.

---

## 8. Stratégie de migration

Séquence en 5 étapes, chacune livrable et vérifiable indépendamment. Aucune ne redessine l'UI,
aucune ne modifie un composant existant autrement que par ses imports.

### Étape 0 — Filet de sécurité *(préalable, non négociable)*

1. `git init`, `.gitignore` vérifié, **commit initial de référence**.
2. Installer et configurer ESLint (`typescript-eslint`, `eslint-plugin-react-hooks`,
   `eslint-plugin-jsx-a11y`) — le script `lint` doit passer.
3. Installer Vitest + Testing Library. Écrire un **test de fumée par route** (la page monte et
   rend son titre). ~17 tests triviaux, mais ils transforment la migration : toute régression
   d'import devient rouge immédiatement.

> Sans cette étape, les étapes suivantes ne sont pas réversibles.

### Étape 1 — Découpler avant de déplacer

Corriger les inversions de dépendance **dans la structure actuelle**, où tout compile encore :

- `Sidebar` reçoit ses items de navigation en prop (`items`, `secondaryItems`, `primaryAction`)
  au lieu de les importer. `AppShell` les lui passe.
- Extraire les tokens de `index.css` / `tailwind.config.ts` vers un preset partageable.
- Trancher le nommage `caf` vs `apl` (§2, S4) et la collision `services/` (S7 — proposition :
  la couche HTTP devient `api/`, les modules administration gardent `services/`).

*Vérification : `npm run build` + tests de fumée verts. Aucun changement visuel.*

### Étape 2 — Créer le monorepo, migrer le citoyen

1. Racine en npm workspaces (`apps/*`, `packages/*`).
2. `packages/config` d'abord (tsconfig de base, preset Tailwind, config ESLint partagée) — tous
   les autres en dépendent.
3. `packages/shared-types` ← `src/types/`.
4. `packages/ui` ← `components/ui/` + `components/shared/` + tokens. **Copie intacte**, seuls les
   imports changent.
5. `packages/core` ← `hooks/`, `store/`, `lib/utils.ts`, `app/config/services.ts`.
   Filtre strict : rien de CAF/APL, rien de spécifique citoyen.
6. `packages/api-client` ← `services/apiClient.ts` + les services métier.
7. `apps/citizen-portal` ← tout le reste, avec `features/apl` → `services/apl/`.

*Vérification à chaque sous-étape : `tsc -b` + build + tests. Ne pas enchaîner sur un rouge.*

### Étape 3 — Fonder le portail agent

Application neuve : `main.tsx`, routeur, layout et navigation propres. Réutilise `packages/*`,
ne partage **aucune** logique applicative avec le portail citoyen. `AgentDashboardPage` y est
déplacée telle quelle, bandeau « provisoire » compris — l'absence de maquette agent (B4) n'est pas
résolue par cette migration et doit rester visible.

Les 6 autres features agent (`cases`, `documents`, `validation`, `reports`, `assistant`,
`settings`) sont créées comme **structures de dossiers avec routes déclarées et pages vides**,
en cohérence avec la doctrine « aucune donnée fictive » du `roadmap.md`. Ne pas inventer d'écrans
sans design.

### Étape 4 — Verrouiller les frontières

`eslint-plugin-import` + `no-restricted-imports` pour rendre les règles exécutables :

- `packages/ui` ne peut importer que `shared-types` et `config`.
- `packages/core` ne peut pas importer une `app/*`.
- `apps/*` ne peuvent pas s'importer entre elles.
- un `features/*` ne peut pas importer un autre `features/*`.
- un `services/*` (administration) ne peut pas importer un autre `services/*`.

*C'est cette étape qui fait tenir l'architecture dans le temps. Une règle non outillée est une
convention, et une convention finit par être violée.*

### Étape 5 — Accessibilité, assistant, documentation

Phases 7, 8 et 9 du cahier des charges. À traiter **après** que la structure soit stable et verte,
pas pendant.

---

## 9. Critères de validation

Une étape n'est terminée que si **tous** ces points sont vrais :

- [ ] `npm run typecheck` passe sur tous les workspaces
- [ ] `npm run build` passe sur les deux applications
- [ ] `npm run lint` passe, règles de frontière incluses
- [ ] Les tests de fumée par route sont verts
- [ ] Les deux portails démarrent et naviguent sur toutes leurs routes
- [ ] **Aucune différence visuelle** — comparaison écran par écran avec `design-preference/`
- [ ] Aucune classe Tailwind, aucun token, aucune valeur de couleur n'a été modifié
- [ ] Le diff ne contient que des déplacements de fichiers et des changements d'import

---

## 10. Risques

| Risque | Probabilité | Gravité | Mitigation |
|---|---|---|---|
| Perte de code (pas de git) | Élevée | Critique | Étape 0 avant tout |
| Régression visuelle silencieuse | Moyenne | Élevée | Copie intacte, revue écran par écran contre `design-preference/` |
| Rupture de résolution des alias `@/*` | Élevée | Moyenne | Centralisation dans `packages/config`, `tsc -b` à chaque sous-étape |
| `packages/core` devient un fourre-tout | Élevée | Élevée | Règle explicite + revue de chaque fichier entrant |
| Divergence des deux portails (duplication) | Moyenne | Moyenne | Tout partage passe par `packages/`, jamais par import croisé |
| Sur-découpage prématuré | Moyenne | Moyenne | npm workspaces seuls ; pas de Turborepo/Nx avant d'en avoir besoin |
| Portail agent construit sans design | Élevée | Élevée | Structure + routes uniquement, écrans vides assumés, bandeau conservé |

---

## Annexe — Ce que cette revue ne couvre pas

- Le backend (hors périmètre explicite).
- La conformité RGAA formelle : l'accessibilité est sérieusement traitée dans le code, mais
  aucun audit n'a été mené et le pied de page déclare « totalement conforme » sans preuve.
  **À vérifier avant mise en ligne** — une déclaration de conformité inexacte est un risque
  juridique, pas seulement technique.
- Les performances (aucune mesure, aucun budget de bundle défini).
- La sécurité (pas d'authentification à auditer aujourd'hui).
