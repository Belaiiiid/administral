# MonParcours — Analyse des maquettes Stitch

> Source analysée : `/design-preference` (13 écrans HTML + captures, 1 fichier `DESIGN.md`).
> Système de design d'origine : **République Assistée**.
> Ce document est la référence unique pour l'implémentation du socle frontend. Aucune fonctionnalité métier n'y est décrite.

---

## 0. Notes de cadrage

| Point | Constat | Décision |
|---|---|---|
| Nom du dossier | Le brief mentionne `/design-reference`, le dossier réel est `/design-preference` | Analyse faite sur `/design-preference` |
| Marque affichée | Toutes les maquettes affichent « APL à l'Aide » | Traité comme **un module de service**, pas comme la marque produit. La marque du socle est **MonParcours** ; le nom du service est injecté via configuration |
| Écran « agent » | **Aucune maquette d'espace agent** n'existe dans la source | Squelette construit par extrapolation des primitives existantes (table, badges, filtres), signalé comme tel |
| Conflit de tokens | `DESIGN.md` (prose) annonce `primary #003593`, mais les tokens YAML **et** les 13 configs Tailwind utilisent `primary #000929` | **Les tokens font foi** : `#000929`. `#003593` est conservé comme accent « IA / conseil » (`--accent-ai`), usage confirmé par les maquettes (bandeaux de recommandation) |
| Icônes | Maquettes = Material Symbols (webfont CDN) ; `DESIGN.md` = « Use Lucide icons » | **Lucide React** retenu : pas de dépendance à une webfont externe, tree-shaking, `aria-hidden` natif. Table de correspondance en §6 |

---

## 1. Inventaire des écrans

13 écrans, répartis en 4 zones fonctionnelles.

### 1.1 Parcours d'entrée (hors coquille applicative)

| Écran | Source | Layout | Éléments notables |
|---|---|---|---|
| Connexion | `login_apl_l_aide` | Centré, carte ~520px, fond `#f9f9f9` | Bouton **FranceConnect** (bleu `#000091`, pleine largeur), séparateur « OU », email + mot de passe (icônes en préfixe, œil de révélation), case « Se souvenir de moi », lien création de compte |
| Créer un compte | `registration_apl_l_aide` | Idem connexion | Même structure de carte, formulaire étendu |
| Préférences d'accessibilité | `pr_f_rences_d_accessibilit_apl_l_aide` | Centré, ~1000px, header allégé | Grille 2 colonnes de 8 cartes à cocher (assistant vocal, saisie vocale, synthèse vocale, texte agrandi, contraste élevé, navigation clavier, interface simplifiée, lecteur d'écran) + bandeau d'aide (n° 3919) + bandeau d'engagement dégradé |
| Sélection des services | `s_lection_des_services_portail_citoyen` | Centré 800px, header « Étape 2 sur 4 » | Grille 2×2 de cartes service sélectionnables (CAF, France Travail, Assurance Maladie, Impôts) + carte « Coming soon » en pointillés + encart conseil IA + barre CTA (Retour / Continuer désactivé) |

### 1.2 Portail citoyen (coquille complète)

| Écran | Source | Layout | Éléments notables |
|---|---|---|---|
| Centre de notifications | `centre_de_notifications_portail_citoyen` | Sidebar + contenu pleine largeur | 4 tuiles de comptage par administration, listes groupées par administration avec en-têtes en capitales, notification avec actions inline, **état vide** (« Aucune nouvelle notification pour Ameli »), bandeau de recommandation IA en pied, ruban d'angle « Suggéré par l'IA » |

### 1.3 Module APL

| Écran | Source | Layout | Éléments notables |
|---|---|---|---|
| Tableau de bord | `dashboard_update_situation_apl_l_aide` | Sidebar + **bento grid 12 colonnes**, gouttière 24px | Bandeau assistant IA (12 col), carte statut avec **jauge circulaire SVG 75%** (8 col), carte upload inversée fond `primary-container` (4 col), 3 widgets de synthèse (4 col chacun), liste d'activités récentes (12 col), **état vide suggestif** en pointillés (12 col), toast IA flottant bas-droite |
| Simulateur APL | `simulateur_apl_apl_l_aide` | Sidebar + 2 colonnes (formulaire / panneau collant) | Barre de progression + **stepper horizontal 3 étapes**, cartes-radio sélectionnables, **stepper numérique −/+**, panneau d'estimation en direct (en-tête inversé sombre), encart explicatif « Pourquoi ce montant ? », encart de garantie |
| Mise à jour guidée | `guided_update_flow_apl_l_aide` | Sidebar + formulaire centré, header simplifié | **Stepper horizontal 4 étapes** avec ligne de liaison, champs texte, champ avec suffixe (`EUR`), select, barre Retour / Suivant, **widget assistant IA flottant** (bulle + panneau) |
| Suivi de demande | `application_tracking_apl_l_aide` | Sidebar + 2 colonnes (2/3 – 1/3) | Fil d'Ariane, carte de statut (badge d'étape, statut coloré, date prévue), **timeline verticale** à pastilles d'état (terminé / en cours / à venir) avec pièces jointes, panneau latéral : conseil IA, estimation avec barre, dropzone, liens support |
| Upload & analyse | `upload_ai_analysis_apl_l_aide` | Sidebar + 2 colonnes (2/3 – 1/3) | **Dropzone** pointillés, liste de fichiers à 3 états (en cours + barre de progression / validé / erreur + action « Réessayer »), cartes d'extraction de données avec indice de confiance, panneau IA, **checklist de complétude** avec barre de progression |
| Centre de documentation | `documentation_portal_apl_l_aide` | Sidebar + grille mixte | Bandeau héro sombre, cartes de guides (sous-grille 2×2), carte de liens à puces cochées, carte média (image + liens), encart « assistance IA » avec champ inline, **article long** (fil d'Ariane, auteur/date/temps de lecture, encart « À noter » à bordure gauche rose, feedback Oui/Non), **accordéon FAQ** |
| Mon profil | `profile_with_situation_history_apl_l_aide` | Sidebar + grille | Carte info personnelles + action « Modifier », carte conseil IA (colonne étroite), 2 cartes de détail (paires libellé/valeur sur fond alterné), carte accessibilité (3 interrupteurs), carte préférences (3 interrupteurs), **tableau d'historique** (Date / Type / Statut avec badges), bouton d'enregistrement en en-tête |
| Assistant IA | `ai_chat_assistant_apl_l_aide` | Sidebar + fil central + panneau droit | Bulles utilisateur (fond `primary` sombre, texte blanc, alignées à droite) / bulles assistant (fond gris clair, avatar carré), **puces de suggestion**, **carte de recommandation** (bordure gauche 4px, fond `#f0f4ff`, actions en grille, feedback pouce haut/bas), composeur (pièce jointe, champ, micro, envoi), mention d'avertissement, panneau : statut du dossier avec progression, liens documentation, carte média |

### 1.4 Espace agent

Aucune maquette. Le squelette réutilise strictement les primitives existantes (coquille, table, badges de statut, filtres) — aucun style nouveau n'est inventé.

---

## 2. Composants réutilisables identifiés

### 2.1 Primitives (`components/ui/`)

| Composant | Variantes observées dans les maquettes |
|---|---|
| `Button` | `primary` (fond `#000929`, texte blanc) · `outline` (fond blanc, bordure `#E5E7EB`) · `outline-primary` (bordure + texte `primary`) · `ghost` · `destructive` (fond `#C00327`) · `secondary` (fond `#a1385f`, écran de suivi) · `link` — tailles `sm` / `md` / `lg` / `icon`, hauteur mini 44px pour les cibles tactiles |
| `Input` | Fond blanc, bordure 1px, radius 8px, focus = bordure `primary` + anneau 2px à 20% · variantes avec icône préfixe, suffixe texte (`EUR`), bouton suffixe (œil) |
| `Textarea` | Composeur de chat |
| `Select` | Type de bail, filtres |
| `Checkbox` | Radius 4px — « Se souvenir de moi », cartes d'accessibilité |
| `RadioCard` | Carte-radio sélectionnable (simulateur, sélection de services) : bordure + fond `#f0f4ff` à l'état actif |
| `Switch` | Profil (accessibilité, préférences) |
| `Card` | Blanc, radius 12px (`xl`), bordure `#E5E7EB`, ombre douce · sous-parties `Header` / `Title` / `Content` / `Footer` |
| `Badge` | `neutral` · `success` (vert) · `warning` · `error` · `info` · `accent` (rose `secondary-fixed`) — pilules `rounded-full`, `label-sm` |
| `Dialog` | Non présent tel quel, mais requis par le brief — construit sur les tokens de carte |
| `DropdownMenu` | Menu profil, filtres de notifications |
| `Tabs` | Regroupements du profil et de la documentation |
| `Table` | Historique du profil : **pas de bordures verticales**, séparateurs horizontaux 1px, en-têtes `label-sm` en capitales |
| `Progress` | Barre linéaire (simulateur, estimation, upload, complétude) |
| `Avatar` | Rond, anneau 2px `primary-fixed`, repli initiales (« JD ») |
| `Separator`, `Skeleton`, `Label`, `Alert` | Support |

### 2.2 Composants partagés (`components/shared/`)

| Composant | Origine |
|---|---|
| `StatusBadge` | Mappe un statut métier (`validated` / `in_progress` / `pending` / `error`) vers un `Badge` + icône |
| `AiSuggestionCard` | Bordure gauche 4px `#003593`, fond `#f0f4ff`, pied de feedback « Est-ce utile ? » (pouces) — présent sur **6 écrans** |
| `Stepper` | Horizontal (desktop) / vertical (mobile), pastilles numérotées, ligne de liaison |
| `Timeline` | Verticale, pastilles d'état, contenu et pièces jointes |
| `Dropzone` | Pointillés 2px, état `drag-over` (bordure `primary` + fond teinté), variante inversée sur fond sombre |
| `EmptyState` | Icône ronde, titre, texte, actions — deux styles : neutre (notifications) et suggestif en pointillés (tableau de bord) |
| `StatCard` / `DataRow` | Paires libellé/valeur des widgets et cartes de détail |
| `CircularProgress` | Jauge SVG du tableau de bord |
| `SectionHeader` | Titre `label-md` en capitales + lien d'action |
| `ServiceCard` | Carte d'administration sélectionnable |
| `FeedbackButtons` | Pouce haut / bas |

---

## 3. Design system extrait

### 3.1 Couleurs (tokens faisant foi)

**Marque**
| Rôle | Valeur |
|---|---|
| `primary` | `#000929` — navy quasi noir : boutons, titres, sidebar active |
| `on-primary` | `#ffffff` |
| `primary-container` | `#001d59` — surfaces inversées (carte upload, héro documentation) |
| `primary-fixed` | `#dbe1ff` — fonds d'accent doux, item de nav actif |
| `primary-fixed-dim` | `#b4c5ff` |
| `on-primary-fixed` | `#00174b` |
| `surface-tint` | `#3559b6` |
| `accent-ai` | `#003593` + fond `#f0f4ff` — cartes de recommandation IA |

**Secondaire** (accent institutionnel rose-magenta)
`secondary #a1385f` · `secondary-fixed #ffd9e1` · `secondary-fixed-dim #ffb1c6` · `on-secondary-fixed #3f001c`

**Surfaces**
`background` / `surface` `#f9f9f9` · `surface-container-lowest` `#ffffff` · `surface-container-low` `#f3f3f4` · `surface-container` `#eeeeee` · `surface-container-high` `#e8e8e8` · `surface-container-highest` `#e2e2e2` · `inverse-surface` `#2f3131`

**Texte**
`on-surface` `#1a1c1c` · `on-surface-variant` `#45464f` · `text-main` `#1F2937` · `text-muted` `#6B7280` · `outline` `#757680`

**Bordures**
`border-subtle` `#E5E7EB` (le plus utilisé) · `outline-variant` `#c5c6d0`

**Statuts**
`success` vert (`#16a34a` / fond `#dcfce7`) · `error` `#ba1a1a`, `status-error` `#C00327`, conteneur `#ffdad6` · `warning` ambre · `info` = `primary-fixed`

**Identité République Française**
`#000091` (bleu) · `#ffffff` · `#e1000f` (rouge) — bandeau tricolore du logo et du pied de page.

### 3.2 Typographie

**Inter** exclusivement (400 / 500 / 600 / 700 / 800).

| Token | Taille | Interligne | Graisse | Interlettrage |
|---|---|---|---|---|
| `display` | 36px | 44px | 700 | −0.02em |
| `headline-lg` | 28px | 36px | 600 | −0.01em |
| `headline-lg-mobile` | 24px | 32px | 600 | — |
| `headline-md` | 20px | 28px | 600 | — |
| `body-lg` | 18px | 28px | 400 | — |
| `body-md` | 16px | 24px | 400 | — |
| `body-sm` | 14px | 20px | 400 | — |
| `label-md` | 14px | 20px | 600 | 0.01em |
| `label-sm` | 12px | 16px | 500 | — |

Convention observée : les titres de section de widget utilisent `label-md` **en capitales avec `tracking-wider`**.

### 3.3 Layout & espacements

- **Base 8px** : toutes les marges, paddings et hauteurs sont des multiples de 8.
- `container-max` **1200px** · `gutter` **24px** · marge mobile **16px** · marge desktop **32px**.
- **Sidebar fixe 256px** (`w-64`), contenu décalé de `ml-64`.
- **Header 64px** (`h-16`), collant, `z-40` (sidebar `z-50`).
- **Grille bento 12 colonnes**, gouttière 24px — répartitions observées : `12`, `8/4`, `4/4/4`.
- **Formulaires en parcours** : colonne centrée **max 800px**.
- **Article de documentation** : colonne de lecture centrée.
- Cible tactile minimale **44px**.

### 3.4 Style visuel

- **Rayons** : `sm` 4px (cases, tags) · `DEFAULT`/`lg` 8px (boutons, champs) · `xl` 12px (cartes) · `full` (pilules, avatars).
  *Note : `DESIGN.md` annonce 8px par défaut, les configs Tailwind déclarent `DEFAULT: 0.25rem` et `lg: 0.5rem`. Les tokens font foi ; l'échelle est renommée explicitement à l'implémentation pour lever l'ambiguïté.*
- **Ombre unique** : `0 1px 3px 0 rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1)`. Survol de carte : `0 4px 12px rgb(0 0 0 / .05)` + `translateY(-2px)`.
- **Aucun dégradé, aucun flou** (une exception isolée : bandeau d'engagement de l'écran accessibilité).
- **Transitions** : 200ms `cubic-bezier(.4,0,.2,1)`, limitées à la couleur, l'ombre et la transformation.

### 3.5 Points de rupture

`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280.
Règles observées : bascule des grilles en `md`, colonnes latérales empilées en `lg`, descente de l'échelle typographique des titres à 768px, sidebar en tiroir sous `lg`.

---

## 4. Accessibilité (RGAA)

Ce que les maquettes prévoient déjà — et ce que le socle doit garantir :

**Acquis dans les maquettes**
- `<html lang="fr">` sur les 13 écrans.
- Pied de page « Accessibilité : totalement conforme » (déclaration RGAA).
- Écran dédié aux préférences d'accessibilité : contraste élevé, texte agrandi (+20%), navigation clavier renforcée, interface simplifiée (réduction des animations), lecteur d'écran, synthèse et saisie vocales.
- Contrastes : `#1a1c1c` sur `#f9f9f9` ≈ 15:1 · blanc sur `#000929` ≈ 18:1 — largement AAA.

**À garantir par le socle**
| Exigence | Implémentation |
|---|---|
| Navigation clavier | Ordre de tabulation naturel, aucun `tabindex` positif, pièges de focus uniquement dans les dialogues (Radix) |
| Indicateur de focus | Anneau 2px `primary` + décalage 2px, **jamais supprimé** ; classe globale renforcée quand la préférence « navigation clavier » est active |
| Lien d'évitement | « Aller au contenu principal » en première position, visible au focus |
| Structure sémantique | `header` / `nav` / `main` / `aside` / `footer`, un seul `h1` par page, hiérarchie de titres sans saut |
| Icônes | `aria-hidden` systématique ; toute action icône seule porte un `aria-label` |
| États | `aria-current="page"` sur la nav, `aria-live="polite"` sur les zones de statut et toasts, `aria-invalid` + `aria-describedby` sur les champs en erreur |
| Formulaires | `label` associé explicitement, messages d'erreur liés, pas de contrainte de temps |
| Mouvement | `prefers-reduced-motion` respecté globalement + préférence « interface simplifiée » |
| Cibles | 44×44px minimum |
| Langue | `lang="fr"`, contenus en français |

---

## 5. Cartographie maquettes → modules applicatifs

| Maquette | Module cible | Route |
|---|---|---|
| Sélection des services | `features/portal` | `/portal/services` |
| Centre de notifications | `features/portal` | `/portal/notifications` |
| *(à créer)* Tableau de bord citoyen | `features/portal` | `/portal` |
| Tableau de bord APL | `features/apl` | `/apl` |
| Simulateur APL | `features/apl` | `/apl/simulateur` |
| Mise à jour guidée | `features/apl` | `/apl/demande` |
| Suivi de demande | `features/apl` | `/apl/demande/:id` |
| Upload & analyse | `features/documents` | `/documents/depot` |
| Centre de documentation | `features/documents` | `/documents` |
| Mon profil | `features/profile` | `/profile` |
| Préférences d'accessibilité | `features/profile` | `/profile/accessibilite` |
| Assistant IA | `features/chatbot` | `/chat` |
| Connexion / Inscription | `features/auth` *(coquille seule)* | `/login`, `/register` |
| *(extrapolé)* Espace agent | `features/agent` | `/agent` |

## 6. Correspondance des icônes (Material Symbols → Lucide)

| Maquette | Lucide |
|---|---|
| `dashboard` | `LayoutDashboard` |
| `description` | `FileText` |
| `folder_open` | `FolderOpen` |
| `calculate` | `Calculator` |
| `smart_toy` | `Bot` |
| `settings` | `Settings` |
| `logout` | `LogOut` |
| `notifications` | `Bell` |
| `help_outline` | `HelpCircle` |
| `search` | `Search` |
| `account_balance` | `Landmark` |
| `person` | `User` |
| `family_restroom` | `Users` |
| `home` / `house` | `Home` |
| `event` | `Calendar` |
| `check_circle` | `CheckCircle2` |
| `cloud_upload` | `UploadCloud` |
| `auto_awesome` | `Sparkles` |
| `verified` | `BadgeCheck` |
| `info` | `Info` |
| `chevron_right` | `ChevronRight` |
| `arrow_back` | `ArrowLeft` |
| `add` | `Plus` |
| `close` | `X` |
| `work` | `Briefcase` |
| `medical_services` | `Stethoscope` |
| `speed` | `Gauge` |
| `analytics` | `BarChart3` |
| `mic` | `Mic` |
| `send` | `Send` |
| `visibility` | `Eye` |
| `thumb_up` / `thumb_down` | `ThumbsUp` / `ThumbsDown` |
