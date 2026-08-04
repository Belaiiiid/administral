# Ad'Ministral — Charte graphique & guide d'interface

Guide de référence pour toute personne qui modifie ou crée une interface dans
`frontend/`. Il décrit **les couleurs, les typographies, les espacements et les
composants réellement utilisés dans le code**.

**Fichiers source (source de vérité) :**

| Fichier | Contenu |
| --- | --- |
| [frontend/src/index.css](../frontend/src/index.css) | Toutes les variables CSS (couleurs, polices) |
| [frontend/tailwind.config.ts](../frontend/tailwind.config.ts) | Mapping variables → classes Tailwind, échelle typo, radius, ombres |
| [frontend/index.html](../frontend/index.html) | Chargement des polices Google Fonts |
| [frontend/src/components/ui/](../frontend/src/components/ui/) | Primitives (Button, Card, Badge…) |

> ⚠️ **Règle n°1 : on ne code jamais une couleur en dur.**
> Pas de `#0462d3`, pas de `bg-blue-600`, pas de `text-slate-500`.
> On utilise toujours un token (`bg-primary`, `text-on-surface-variant`,
> `border-border`…). C'est ce qui permet aux préférences d'accessibilité
> (contraste élevé, texte agrandi) de fonctionner sans retoucher un seul composant.

---

## 1. Les deux thèmes du projet

Le projet fait cohabiter **deux systèmes de design**, sélectionnés par une classe
CSS sur le conteneur racine du layout :

| Thème | Classe | Où | Bleu principal | Polices |
| --- | --- | --- | --- | --- |
| **Institutionnel** (historique) | *(aucune)* | Espace agent, back-office CAF, France Travail, onboarding vocal | Navy `#091f4e` | Inter / Manrope |
| **Administral** (refonte citoyenne) | `.citizen-scope` | Landing publique, portail citoyen (`CitizenAppShell`) | Bleu vif `#0462d3` | DM Sans / Plus Jakarta Sans |

`.citizen-scope` **redéfinit** `--background`, `--surface`, `--border-subtle`,
`--text-muted`, `--font-sans` et `--font-display`. Tout le reste (statuts, primary,
secondary…) est partagé entre les deux thèmes.

**Conséquence pratique :** le même composant (`<Card>`, `<Badge>`) rend
différemment selon qu'il est dans `CitizenAppShell` ou dans `AppShell`. C'est
voulu — n'ajoutez pas de couleur en dur pour « corriger » ça.

Les fichiers concernés :
- [CitizenAppShell.tsx](../frontend/src/components/layout/CitizenAppShell.tsx) — porte `.citizen-scope`
- [AppShell.tsx](../frontend/src/components/layout/AppShell.tsx) / [AdminLayout.tsx](../frontend/src/components/layout/AdminLayout.tsx) — thème institutionnel

---

## 2. Palette — thème institutionnel (agent / France Travail)

### 2.1 Marque

| Token CSS | Classe Tailwind | Hex | Usage |
| --- | --- | --- | --- |
| `--primary` | `bg-primary` / `text-primary` | `#091f4e` | Navy institutionnel : boutons primaires, titres forts |
| `--on-primary` | `text-primary-foreground` | `#ffffff` | Texte sur fond primary |
| `--primary-container` | `bg-primary-container` | `#000927` | Sidebar, bandeaux très sombres |
| `--primary-fixed` | `bg-primary-fixed` | `#dce3f5` | Fond bleu pâle : badges info, hover outline |
| `--primary-fixed-dim` | `bg-primary-fixed-dim` | `#b4c5ff` | Variante plus saturée |
| `--on-primary-fixed` | `text-primary-on-fixed` | `#00174b` | Texte sur `primary-fixed` |

### 2.2 Secondaire (rose)

| Token CSS | Classe Tailwind | Hex | Usage |
| --- | --- | --- | --- |
| `--secondary` | `bg-secondary` | `#d46087` | Accent rose, CTA secondaires |
| `--on-secondary` | `text-secondary-foreground` | `#ffffff` | Texte sur secondary |
| `--secondary-fixed` | `bg-secondary-fixed` | `#ffd9e1` | Badge « accent » |
| `--secondary-fixed-dim` | `bg-secondary-fixed-dim` | `#ffb1c6` | Variante saturée |
| `--on-secondary-fixed` | `text-secondary-on-fixed` | `#3f001c` | Texte sur `secondary-fixed` |

### 2.3 Accent IA

Réservé à tout ce qui est **généré ou recommandé par l'IA** (cartes de
recommandation, réponses du chatbot). Ne pas l'utiliser pour du contenu ordinaire :
c'est un signal, pas une décoration.

| Token CSS | Classe Tailwind | Hex |
| --- | --- | --- |
| `--accent-ai` | `text-ai` / `bg-ai` | `#003593` |
| `--accent-ai-surface` | `bg-ai-surface` | `#dce3f5` |

### 2.4 Surfaces (empilement tonal)

Du plus clair au plus foncé — chaque niveau correspond à une profondeur.

| Token CSS | Classe Tailwind | Hex | Usage |
| --- | --- | --- | --- |
| `--surface-container-lowest` | `bg-surface-lowest` | `#ffffff` | Cartes, modales, champs |
| `--background` / `--surface` | `bg-background` / `bg-surface` | `#f9f9f9` | Fond de page |
| `--surface-container-low` | `bg-surface-low` | `#f3f3f4` | Zones atténuées |
| `--surface-container` | `bg-surface-container` | `#eeeeee` | Badge neutre |
| `--surface-container-high` | `bg-surface-high` | `#e8e8e8` | Hover des boutons ghost |
| `--surface-container-highest` | `bg-surface-highest` | `#e2e2e2` | Séparateurs de blocs |
| `--inverse-surface` | `bg-surface-inverse` | `#2f3131` | Tooltips, toasts sombres |

### 2.5 Texte

| Token CSS | Classe Tailwind | Hex | Usage |
| --- | --- | --- | --- |
| `--on-surface` | `text-on-surface` | `#1a1c1c` | Texte principal, titres |
| `--on-surface-variant` | `text-on-surface-variant` | `#45464f` | Texte secondaire, descriptions |
| `--text-muted` | `text-muted-foreground` | `#6b7280` | Métadonnées, aides, placeholders |

### 2.6 Bordures

| Token CSS | Classe Tailwind | Hex | Usage |
| --- | --- | --- | --- |
| `--border-subtle` | `border-border` | `#e5e7eb` | Bordure par défaut (cartes, inputs) |
| `--outline-variant` | `border-border-strong` / `border-outline-variant` | `#c5c6d0` | Bordure marquée |
| `--outline` | `border-outline` | `#757680` | Bordure forte / états actifs |

### 2.7 Statuts

Toujours par paire **couleur pleine + surface** : la surface pour le fond du
badge, la couleur pleine pour le texte et l'icône.

| Statut | Token | Classe | Hex |
| --- | --- | --- | --- |
| Succès | `--success` / `--success-surface` | `text-success` / `bg-success-surface` | `#16a34a` / `#dcfce7` |
| Avertissement | `--warning` / `--warning-surface` | `text-warning` / `bg-warning-surface` | `#b45309` / `#fef3c7` |
| Erreur | `--error` / `--error-surface` | `text-destructive` / `bg-destructive-surface` | `#ba1a1a` / `#ffdad6` |
| Erreur (bouton) | `--status-error` | `bg-destructive-strong` | `#c00327` |

### 2.8 Identité République Française

Valeurs officielles du tricolore — **ne jamais les altérer** (opacité, teinte,
dégradé). Réservées au bloc d'identité institutionnelle (bandeau Marianne, logos).

| Classe | Hex |
| --- | --- |
| `bg-rf-blue` | `#000091` |
| `bg-rf-white` | `#ffffff` |
| `bg-rf-red` | `#e1000f` |

---

## 3. Palette — thème Administral (`.citizen-scope`)

Tokens déclarés en **oklch** dans le CSS ; l'équivalent hexadécimal est donné
ci-dessous à titre indicatif (pour Figma) — **dans le code, on écrit toujours la
classe Tailwind**, pas le hex.

| Token CSS | Classe Tailwind | oklch | ≈ Hex | Usage |
| --- | --- | --- | --- | --- |
| `--admtl-brand` | `text-brand` / `bg-brand` | `oklch(0.52 0.19 258)` | `#0462d3` | Bleu de marque : liens, CTA, focus ring citoyen |
| `--admtl-brand-soft` | `bg-brand-soft` | `oklch(0.94 0.03 250)` | `#ddedff` | Fond bleu très pâle : panneaux assistant, callouts |
| `--admtl-marianne` | `bg-marianne` | `oklch(0.32 0.13 265)` | `#112a74` | Bandeau institutionnel sombre |
| `--admtl-marianne-foreground` | `text-marianne-foreground` | `oklch(0.99 0.005 250)` | `#f9fcff` | Texte sur `marianne` |
| `--admtl-ink` | `text-ink` | `oklch(0.19 0.06 264)` | `#06122e` | Titres (le plus foncé) |
| `--admtl-foreground` | `text-foreground` | `oklch(0.22 0.05 262)` | `#0d1a32` | Corps de texte |
| `--admtl-card` | `bg-card` | `oklch(1 0 0)` | `#ffffff` | Fond de carte |
| `--admtl-card-foreground` | `text-card-foreground` | `oklch(0.129 0.042 264.695)` | `#020618` | Texte sur carte |
| `--admtl-chart-2` | `text-chart-2` | `oklch(0.6 0.118 184.704)` | `#009689` | Teal — 2ᵉ série de graphique, dégradés |

### Surfaces redéfinies dans `.citizen-scope`

| Token | Valeur institutionnelle | Valeur citoyenne | ≈ Hex |
| --- | --- | --- | --- |
| `--background` | `#f9f9f9` | `oklch(1 0 0)` | `#ffffff` |
| `--surface` | `#f9f9f9` | `oklch(0.985 0.008 250)` | `#f6fbff` |
| `--border-subtle` | `#e5e7eb` | `oklch(0.929 0.013 255.508)` | `#e2e8f0` |
| `--text-muted` | `#6b7280` | `oklch(0.52 0.046 257.417)` | `#586a84` |

> 🎯 **Contraste :** `--admtl-brand` est volontairement à `0.52` de luminance et
> non `0.55`. À `0.55`, le bleu sur `brand-soft` tombe à 4.18:1 — sous le seuil
> WCAG AA (4.5:1). Si vous changez cette valeur, **revérifiez le contraste** sur
> `brand-soft` et sur `card`.

---

## 4. Typographie

### 4.1 Familles

| Rôle | Variable CSS | Classe | Institutionnel | Administral (`.citizen-scope`) |
| --- | --- | --- | --- | --- |
| Texte courant | `--font-sans` | `font-sans` | **Inter** (400/500/600/700/800) | **DM Sans** (400/500/600/700) |
| Titres / display | `--font-display` | `font-display` | **Manrope** (700/800) | **Plus Jakarta Sans** (600/700/800) |

Chargées via Google Fonts dans [index.html](../frontend/index.html). Fallbacks :
`system-ui`, `-apple-system`, `Segoe UI`, `sans-serif`.

Pour changer de police : modifier `--font-sans` / `--font-display` dans
[index.css](../frontend/src/index.css) **et** l'URL Google Fonts dans `index.html`.
Ne pas toucher au `fontFamily` du config Tailwind (il pointe déjà sur les variables).

### 4.2 Échelle typographique

Chaque classe encapsule **taille + interlignage + graisse + interlettrage**.
Utilisez-les telles quelles — n'empilez pas `text-2xl font-bold` à la main.

| Classe | Taille | Interlignage | Graisse | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| `text-display` | 36px | 44px | 700 | -0.02em | Titre de page, hero |
| `text-headline-lg` | 28px | 36px | 600 | -0.01em | Titre de section |
| `text-headline-lg-mobile` | 24px | 32px | 600 | — | Idem, < 768px |
| `text-headline-md` | 20px | 28px | 600 | — | Titre de carte |
| `text-body-lg` | 18px | 28px | 400 | — | Chapô, texte mis en avant |
| `text-body-md` | 16px | 24px | 400 | — | **Texte par défaut** |
| `text-body-sm` | 14px | 20px | 400 | — | Descriptions, aides |
| `text-label-md` | 14px | 20px | 600 | 0.01em | Boutons, labels de champ |
| `text-label-sm` | 12px | 16px | 500 | — | Badges, métadonnées |

### 4.3 Classes utilitaires

| Classe | Effet |
| --- | --- |
| `.eyebrow` | Sur-titre : display, 700, 12px, `letter-spacing: 0.12em`, uppercase, couleur `brand` |
| `.section-title` | `label-md` + uppercase + tracking large + `text-on-surface` |

---

## 5. Layout & espacements

Grille de base **8px**. Alias disponibles :

| Classe | Valeur | Usage |
| --- | --- | --- |
| `gap-gutter` / `p-gutter` | 24px | Gouttière entre cartes, grilles |
| `px-margin-mobile` | 16px | Marge latérale mobile |
| `px-margin-desktop` | 32px | Marge latérale desktop |
| `w-sidebar` | 256px | Largeur de la sidebar |
| `h-header` | 64px | Hauteur du header |

Largeurs maximales :

| Classe | Valeur | Usage |
| --- | --- | --- |
| `max-w-container` | 1200px | Conteneur de page |
| `max-w-form` | 800px | Formulaires |
| `max-w-prose` | 720px | Texte long (lisibilité) |

Utilitaire prêt à l'emploi : `.bento-grid` — grille 1 colonne en mobile,
12 colonnes ≥ md, avec la gouttière standard.

---

## 6. Rayons, ombres, animations

### 6.1 Rayons de bordure

| Classe | Valeur | Usage |
| --- | --- | --- |
| `rounded-sm` | 4px | Cases à cocher, tags |
| `rounded` / `rounded-md` / `rounded-lg` | 8px | Boutons, champs |
| `rounded-xl` | 12px | **Cartes** |
| `rounded-2xl` | 16px | Grands conteneurs |
| `rounded-full` | — | Badges, avatars, pastilles |

### 6.2 Ombres

Il n'existe **que deux ombres** dans le projet. Ne pas en inventer d'autres —
la hiérarchie passe par les surfaces tonales, pas par l'élévation.

| Classe | Valeur | Usage |
| --- | --- | --- |
| `shadow-soft` | `0 1px 3px rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1)` | Cartes, boutons primaires |
| `shadow-soft-hover` | `0 4px 12px rgb(0 0 0 / .05)` | Survol des cartes interactives |

### 6.3 Mouvement

| Élément | Valeur |
| --- | --- |
| Durée standard | `duration-200` (200 ms) |
| Courbe | `ease-standard` = `cubic-bezier(0.4, 0, 0.2, 1)` |
| Survol de carte | `hover:-translate-y-0.5` + `shadow-soft-hover` |
| Appui sur bouton | `active:scale-[0.98]` |
| Accordéon | `animate-accordion-down` / `-up` (200 ms) |

Toutes les animations sont neutralisées par `prefers-reduced-motion` et par la
classe `.a11y-reduced-motion`. Si vous ajoutez une animation, vérifiez qu'elle
tombe bien sous ces règles (elles ciblent `*`, donc c'est automatique pour
`animation` et `transition` — mais pas pour un `requestAnimationFrame` en JS).

---

## 7. Composants — variantes existantes

Avant de créer un style, vérifiez qu'il n'existe pas déjà dans
[components/ui/](../frontend/src/components/ui/).

### Button — [button.tsx](../frontend/src/components/ui/button.tsx)

| `variant` | Rendu |
| --- | --- |
| `primary` *(défaut)* | Fond `primary`, texte blanc, `shadow-soft` |
| `secondary` | Fond `secondary` (rose), texte blanc |
| `outline` | Bordure `border`, fond blanc, texte `on-surface-variant` |
| `outline-primary` | Bordure `primary`, transparent, texte `primary` |
| `ghost` | Sans fond, hover `surface-high` |
| `destructive` | Fond `destructive-strong` |
| `link` | Texte `primary` souligné au survol |

| `size` | Hauteur | Note |
| --- | --- | --- |
| `sm` | 36px | À éviter sur mobile |
| `md` *(défaut)* | 44px | **Cible tactile minimale RGAA** |
| `lg` | 48px | CTA principaux |
| `icon` | 44×44px | Bouton icône seule |

Plus `block` (booléen) pour un bouton pleine largeur.

### Card — [card.tsx](../frontend/src/components/ui/card.tsx)

Fond `surface-lowest`, `rounded-xl`, bordure `border`, `shadow-soft`.
Prop `interactive` → curseur pointer + lift de 2px au survol.
Sous-composants : `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` (padding 24px).

### Badge — [badge.tsx](../frontend/src/components/ui/badge.tsx)

| `tone` | Fond / texte |
| --- | --- |
| `neutral` *(défaut)* | `surface-container` / `on-surface-variant` |
| `info` | `primary-fixed` / `primary` |
| `success` | `success-surface` / `success` |
| `warning` | `warning-surface` / `warning` |
| `error` | `destructive-surface` / `destructive` |
| `accent` | `secondary-fixed` / `secondary-on-fixed` |

---

## 8. Accessibilité — ce qu'on ne casse pas

Trois préférences utilisateur sont branchées sur des classes appliquées à la
racine. Elles fonctionnent **uniquement** si vous passez par les tokens.

| Classe | Effet |
| --- | --- |
| `.a11y-high-contrast` | Texte en noir pur, bordures renforcées, fonds blancs |
| `.a11y-large-text` | `--app-font-scale: 1.2` → toutes les tailles en rem grandissent de 20% |
| `.a11y-keyboard-nav` | Anneau de focus épaissi (`ring-4`) |
| `.a11y-reduced-motion` | Animations et transitions neutralisées |

Règles à respecter :

1. **Ne jamais supprimer le focus.** `:focus-visible` applique un
   `ring-2 ring-primary ring-offset-2` global (`ring-brand` dans `.citizen-scope`).
   Pas de `outline-none` sans anneau de remplacement.
2. **Tailles en `rem`, pas en `px`,** pour le texte — sinon « texte agrandi » n'a
   aucun effet. Les classes `text-*` du tableau §4.2 sont déjà correctes.
3. **Cible tactile ≥ 44px** pour tout élément cliquable (bouton `size="md"` mini).
4. **Contraste ≥ 4.5:1** pour le texte courant, **3:1** pour les gros titres et
   les composants d'interface. À vérifier avant de proposer une nouvelle couleur.
5. La couleur ne doit **jamais** être le seul porteur d'information : un statut
   se lit aussi par son libellé ou son icône.

---

## 9. Comment modifier une interface — mode d'emploi

**Changer une couleur partout (ex. le bleu de marque citoyen) :**
→ une seule ligne dans [index.css](../frontend/src/index.css), `--admtl-brand`.
Vérifier ensuite le contraste sur `brand-soft` et sur blanc.

**Ajouter une couleur :**
1. Déclarer la variable dans `:root` de `index.css`.
2. L'exposer dans `theme.extend.colors` de `tailwind.config.ts`.
3. L'utiliser par sa classe. Jamais de hex dans un `.tsx`.

**Changer une police :**
→ `--font-sans` / `--font-display` dans `index.css` **+** l'URL Google Fonts dans
`index.html`. Rien d'autre à toucher.

**Styliser un écran citoyen sans casser l'espace agent :**
→ passer par `.citizen-scope`. Les tokens `--admtl-*` n'existent qu'en usage
citoyen ; les surcharges de `--background` / `--surface` / `--border-subtle` /
`--text-muted` sont volontairement **confinées** à ce sélecteur. Ne les remontez
jamais dans `:root`.

**Créer un composant :**
→ commencer par `components/ui/`. Composer avec `cva` (comme Button/Badge) plutôt
que d'accumuler des classes conditionnelles.

### Anti-patterns

| ❌ | ✅ |
| --- | --- |
| `bg-[#0462d3]` | `bg-brand` |
| `text-slate-500` | `text-muted-foreground` |
| `text-2xl font-bold` | `text-headline-lg` |
| `shadow-lg` | `shadow-soft` |
| `rounded-[10px]` | `rounded-xl` |
| `outline-none` seul | laisser le `:focus-visible` global |
| Ajouter `--admtl-x` dans `.citizen-scope` | le déclarer dans `:root` (le nom est déjà unique) |
