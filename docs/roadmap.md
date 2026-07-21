# MonParcours — Feuille de route

Ce socle est **volontairement inerte** : aucune logique métier, aucun appel réseau, aucune
authentification. Ce document décrit ce qui existe, ce qui n'existe pas, et dans quel ordre
construire la suite.

---

## État actuel (socle v0.1)

| Domaine | État |
|---|---|
| Structure de projet | ✅ Feature-based, code-splitté par route |
| Design system | ✅ Tokens extraits des maquettes, 20 primitives + 10 composants partagés |
| Layouts | ✅ 3 coquilles (application, authentification, parcours guidé) |
| Routage | ✅ 17 routes, garde de rôle en place (non appliquée) |
| Pages | ✅ 14 squelettes statiques — **sans données d'exemple** : chaque liste part vide et rend son état vide |
| Couche services | ✅ Interfaces uniquement — chaque méthode lève une erreur explicite |
| État global | ✅ `uiStore` (UI + accessibilité), `sessionStore` (coquille de session) |
| Accessibilité | ✅ Lien d'évitement, focus visible, préférences fonctionnelles, structure sémantique |
| Backend / API | ❌ Néant |
| Authentification | ❌ Néant |
| Assistant IA | ❌ Néant |
| Tests | ❌ Néant |

### Points d'attention repris de l'analyse

1. **Espace agent extrapolé** — aucune maquette n'existe (`docs/design-analysis.md` §1.4). La page
   affiche un bandeau d'avertissement et doit être revalidée dès que les designs arrivent.
2. **La route `/agent` est inaccessible par défaut** — `sessionStore` renvoie `role: 'citizen'`, donc
   la garde redirige vers `/portal`. Pour la consulter : passer `role: 'agent'` dans
   `src/store/sessionStore.ts`.
3. **Conflit de tokens `primary`** — `#000929` (tokens) retenu contre `#003593` (prose du
   `DESIGN.md`), ce dernier conservé comme accent IA. À confirmer avec l'équipe design.
4. **Le dossier source s'appelle `design-preference`**, pas `design-reference`.
5. **Aucune donnée n'est simulée.** `sessionStore` ne porte plus d'identité fictive
   (`displayName: null`, `activatedServices: []`) et chaque page déclare une collection vide
   (`const NOTIFICATIONS: CitizenNotification[] = []`) commentée avec le service qui la remplira.
   Brancher un service consiste à remplacer cette constante — le rendu des états pleins est déjà
   écrit au-dessus de l'état vide. **Ne pas réintroduire de jeu de données de démonstration** :
   c'est ce qui masquait l'absence de backend dans la version précédente.

---

## Étapes suivantes

### Phase A — Fondations techniques (avant toute fonctionnalité)

1. **Qualité** — ESLint + Prettier, `lint-staged`, CI (typecheck + build + lint).
2. **Tests** — Vitest + Testing Library ; `jest-axe` pour verrouiller les acquis RGAA.
3. **Formulaires** — `react-hook-form` + `zod`. Les squelettes de formulaire (simulateur, mise à
   jour guidée, connexion) sont écrits pour accueillir un resolver sans restructuration.
4. **Données serveur** — TanStack Query, branché dans `AppProviders`. Ne pas mettre l'état serveur
   dans Zustand.
5. **i18n** — le français est aujourd'hui codé en dur dans les composants. Extraire avant que le
   volume de texte ne rende la migration coûteuse.

### Phase B — Authentification

6. Implémenter `apiClient.request()` (en-têtes d'auth, rafraîchissement 401, normalisation d'erreur).
7. Module `features/auth` : FranceConnect (OIDC) + identifiants classiques.
8. Brancher `sessionStore` sur la session réelle. `ProtectedRoute` devient alors actif **sans
   modification**.

### Phase C — Premier module métier (APL)

9. Implémenter `aplService` contre l'API réelle.
10. Brancher le simulateur sur le moteur de calcul certifié.
11. Parcours de dépôt de demande complet (formulaire multi-étapes + sauvegarde de brouillon).
12. Upload réel de documents (progression, reprise, contrôle de type et de taille).

### Phase D — Assistant

13. `chatService` avec réponse en streaming (la signature prévoit déjà le callback de chunk).
14. Rattachement du contexte dossier, garde-fous et traçabilité des recommandations.
15. Persistance du feedback (pouce haut/bas) pour l'évaluation qualité.

### Phase E — Espace agent

16. Obtenir les maquettes, puis reconstruire `features/agent` sur cette base.
17. Modèle d'habilitations plus fin que le simple rôle `citizen` / `agent`.

### Phase F — Nouvelles administrations

Ajouter un service se fait en trois gestes, sans toucher à la coquille :

1. Ajouter l'entrée dans `src/app/config/services.ts`.
2. Créer `src/features/<service>/` avec ses pages.
3. Déclarer les routes dans `src/app/router/index.tsx`.

---

## Conventions à tenir

- **Aucun chemin d'URL en dur** — toujours passer par `ROUTES` (`src/app/router/paths.ts`).
- **Aucune couleur en dur** — utiliser les classes de tokens (`bg-primary`, `text-on-surface-variant`).
  Les seules valeurs littérales autorisées sont celles de l'identité RF (`rf-blue`, `rf-red`).
- **Aucun composant monolithique** — au-delà de ~200 lignes, extraire dans
  `features/<module>/components/`.
- **Isolation des modules** — un module ne doit jamais importer depuis un autre `features/*`.
  Le partage passe par `components/`, `hooks/`, `services/`, `types/`.
- **Accessibilité non négociable** — icône décorative ⇒ `aria-hidden`; action icône seule ⇒
  `aria-label`; jamais de suppression du focus visible.
- **`cn()` et non `twMerge` directement** — l'échelle typographique personnalisée y est déclarée
  (voir `src/lib/utils.ts`), sans quoi les classes de taille écrasent les classes de couleur.
