# MonParcours / AdMinistral — Benchmark concurrentiel & apport de valeur

> Date : 2026-08-05 · Périmètre comparé : ce qui tourne réellement dans ce dépôt
> (voir [`TECH_STACK.md`](TECH_STACK.md)) face aux portails publics en production.

---

## 1. Comment lire ce benchmark

La question « quel est l'apport de valeur ? » n'a pas de réponse tant qu'on n'a pas
posé **sur quel segment** on se compare. Les portails publics existants se
répartissent en trois familles qui ne font pas le même métier :

| Famille | Ce qu'elle fait | Exemples |
|---|---|---|
| **A. Annuaire + identité** | Trouver la bonne démarche, s'authentifier une fois, être redirigé vers le SI de l'organisme | service-public.gouv.fr, GOV.UK + One Login, u.ae Services Directory |
| **B. Droits sociaux** | Simuler l'éligibilité à des prestations, agréger les comptes | mesdroitssociaux.gouv.fr, caf.fr |
| **C. IA-first / proactif** | Assistant conversationnel, services déclenchés par événement de vie | TAMM 4.0 (Abu Dhabi), Albert/« L'Assistant » (DINUM), Bürokratt (EE), LifeSG (SG) |

**MonParcours ne joue dans aucune des trois — il joue à leur intersection, plus un
quatrième étage que personne n'expose : la face agent instructeur.**

C'est le cœur du positionnement, et c'est ce que le reste du document démontre.

---

## 2. Le panel

Les trois références demandées, plus cinq ajouts qui rendent la comparaison
honnête (les trois de départ ne couvrent que la famille A — se comparer à elles
seules produirait un avantage artificiel).

| # | Solution | Pays | Pourquoi dans le panel |
|---|---|---|---|
| 1 | **service-public.gouv.fr** | 🇫🇷 | Référence demandée. Le portail de référence FR : fiches pratiques, formulaires, annuaire |
| 2 | **GOV.UK / One Login / GOV.UK App** | 🇬🇧 | Référence demandée. L'état de l'art mondial sur l'identité unique : 16,6 M d'utilisateurs, 220+ services |
| 3 | **u.ae Services Directory** | 🇦🇪 | Référence demandée. Annuaire fédéral EAU, catégorisé par domaine |
| 4 | **mesdroitssociaux.gouv.fr** | 🇫🇷 | **Le concurrent fonctionnel le plus proche** : simulateur de 58 aides nationales et locales, multi-organismes (CAF, CPAM, Cnav, France Travail) |
| 5 | **caf.fr / Mon Compte** | 🇫🇷 | Le vertical que MonParcours attaque en premier. Le point de comparaison sur l'APL |
| 6 | **TAMM 4.0** | 🇦🇪 | **Le plus avancé au monde sur l'IA de service public** : assistant agentique, 1000+ services, fonction « AutoGov » qui exécute les renouvellements sans demande |
| 7 | **Albert / « L'Assistant » (DINUM)** | 🇫🇷 | L'IA d'État française, sur Mistral comme MonParcours. **Cas d'école du risque** : abandon de la généralisation début 2026 pour cause de fiabilité |
| 8 | **Bürokratt (EE) / LifeSG (SG)** | 🇪🇪🇸🇬 | L'école « événements de vie » : services proactifs, une porte d'entrée en langage naturel |

---

## 3. Grille de comparaison

✅ = disponible en production · 🟡 = partiel / expérimental · ❌ = absent
🔵 = **présent dans MonParcours aujourd'hui** · ⚪ = prévu, non fait

| Capacité | service-public | GOV.UK | u.ae | mesdroitssociaux | caf.fr | TAMM 4.0 | Albert | **MonParcours** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Identité unique / SSO régalien | ✅ FranceConnect | ✅ One Login | ✅ UAE Pass | ✅ | ✅ | ✅ | n/a | ⚪ JWT propre, FranceConnect non branché |
| Annuaire de démarches | ✅ | ✅ | ✅ | 🟡 | ❌ | ✅ 1000+ | ❌ | 🔵 13 administrations déclarées, **2 câblées** |
| Simulation de droits | 🟡 renvoi | 🟡 | ❌ | ✅ **58 aides** | ✅ APL/AF | 🟡 | ❌ | 🔵 APL, moteur de règles serveur |
| Dépôt de demande **dans** le portail | ❌ redirige | 🟡 selon service | ❌ redirige | ❌ redirige | ✅ (CAF seule) | ✅ | ❌ | 🔵 parcours complet APL |
| Checklist de pièces **personnalisée** | ❌ liste statique | ❌ | ❌ | ❌ | 🟡 générique | 🟡 | ❌ | 🔵 dérivée du profil, LLM + règles |
| **OCR des pièces jointes** | ❌ | ❌ | 🟡 | ❌ | 🟡 interne | ✅ | ❌ | 🔵 `mistral-ocr-latest` |
| **Analyse de cohérence inter-documents** | ❌ | ❌ | ❌ | ❌ | ❌ back-office | 🟡 | ❌ | 🔵 score 0–100 + anomalies + explication |
| **Détection de fraude documentaire** | ❌ | ❌ | ❌ | ❌ | 🟡 datamining *sur profil* | ❌ | ❌ | 🔵 forensics métadonnées + `mistral-large` |
| Assistant conversationnel | 🟡 FAQ | 🟡 GOV.UK Chat | 🟡 U-Ask | ❌ | 🟡 | ✅ agentique | 🟡 **généralisation abandonnée** | 🔵 RAG hybride BM25+Qdrant+RRF |
| Réponses **avec citation de source** | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | ❌ *(c'est ce qui l'a coulé)* | 🔵 citations systématiques |
| **Ancrage au texte de loi (article)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🔵 **knowledge graph CCH Livre VIII** |
| Assistant contextualisé au **dossier** de l'usager | ❌ | ❌ | ❌ | ❌ | 🟡 | ✅ | ❌ | 🔵 routage intention → RAG ou dossier |
| **Poste de travail agent instructeur** | ❌ | ❌ | ❌ | ❌ | ❌ *(SI séparé)* | ❌ | 🟡 outil agent | 🔵 file, dashboard, décision, rapports |
| **Explication de décision opposable** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🔵 composée **uniquement** des preuves extraites |
| Contestation / recours en ligne | 🟡 formulaire | 🟡 | 🟡 | ❌ | 🟡 | 🟡 | ❌ | 🔵 module dédié |
| Piste d'audit des décisions | n/a | n/a | n/a | n/a | interne | 🟡 | ❌ | 🔵 module `audit` |
| Accessibilité (RGAA/WCAG) | ✅ | ✅ **référence** | ✅ | ✅ | ✅ | ✅ | n/a | 🔵 RGAA + 7 préférences persistées |
| **Assistant vocal natif (STT+TTS)** | ❌ | ❌ | 🟡 | ❌ | ❌ | 🟡 multilingue | ❌ | 🔵 Whisper + TTS Mistral, PTT |
| Souveraineté du modèle | n/a | ❌ mixte | ❌ Azure/OpenAI | n/a | n/a | ❌ Microsoft | ✅ Mistral | 🔵 **Mistral seul + embeddings locaux** |
| Proactivité (service sans demande) | ❌ | 🟡 rappels | ❌ | ❌ | 🟡 | ✅ **AutoGov** | ❌ | ❌ |
| Application mobile / wallet | 🟡 | ✅ App + Wallet | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Volume de services réels | ~3000 fiches | **220+** | plusieurs centaines | 58 aides | ~10 | **1000+** | n/a | **2** |

---

## 4. Lecture par solution : ce qu'elles font, ce qu'elles ne font pas

### 4.1 service-public.gouv.fr — le référentiel, pas le guichet

Excellent sur la **documentation** (fiches pratiques, formulaires Cerfa, annuaire).
Structurellement **une couche de redirection** : à la fin de chaque fiche, le
citoyen part sur caf.fr, ants.gouv.fr ou impots.gouv.fr et recommence son
parcours. Aucune instruction, aucune analyse de pièce, aucun état de dossier.

> **Écart exploitable** : service-public.fr vous dit *quels* documents fournir.
> MonParcours regarde les documents que vous avez déposés et vous dit *ce qui
> manque et ce qui ne colle pas*. C'est la différence entre une notice et un contrôle.

### 4.2 GOV.UK — l'état de l'art de l'identité, pas de l'instruction

One Login est ce que la France n'a pas réussi à faire aussi loin : 16,6 M de
comptes, 220+ services, une App et un Wallet (permis de conduire numérique), et
une roadmap vers une « government mailbox » en 2027. **C'est un socle
d'accès, pas un socle de traitement.** Le back-office de chaque département
(DWP, DVLA…) reste un SI distinct, invisible et non intégré.

> **Ce qu'on ne battra pas** : la couverture et la maturité de l'identité. C'est
> un actif d'État, pas un produit.
> **Écart exploitable** : GOV.UK n'a rien qui ressemble à une chaîne d'analyse
> documentaire ni à un poste d'instruction outillé par l'IA.

### 4.3 u.ae Services Directory — un annuaire fédéral bien rangé

Catégorisation par domaine (business, éducation, santé, justice), U-Ask en appui.
Même logique de redirection que service-public.fr. **Le vrai comparable aux EAU
n'est pas u.ae mais TAMM** (§4.6).

### 4.4 mesdroitssociaux.gouv.fr — le concurrent le plus dangereux

C'est la solution qui ressemble le plus à l'ambition de MonParcours : **un
parcours, plusieurs organismes**, 58 aides nationales et locales simulées en une
session, accès unique aux espaces personnels CAF/CPAM/Cnav/France Travail.

**Mais il s'arrête au clic « faire ma demande »** : il simule et il oriente, il
n'instruit pas. Aucune pièce n'est déposée, analysée ni décidée dans
mesdroitssociaux. Il n'a pas d'assistant conversationnel.

> **Écart exploitable** : MonParcours continue exactement là où
> mesdroitssociaux s'arrête — dépôt, checklist personnalisée, OCR, complétude,
> cohérence, instruction, décision motivée, contestation.
> **Risque** : si la DSS branche le dépôt réel + FranceConnect+ sur son
> simulateur, l'écart se réduit à l'IA documentaire et à la face agent.

### 4.5 caf.fr — la profondeur verticale, et son angle mort de confiance

caf.fr fait de bout en bout ce que MonParcours fait sur l'APL — sur son propre
périmètre uniquement, avec un back-office fermé.

**Le point de comparaison décisif est ailleurs.** Le « Datamining Données
Entrantes » de la CNAF attribue un **score de risque** aux allocataires pour
cibler les contrôles. Le code source a été ouvert en janvier 2026, mais
La Quadrature du Net et une quinzaine d'organisations en demandent l'abandon
devant le Conseil d'État, et le Défenseur des droits a reconnu que l'outil peut
« causer une discrimination indirecte » — percevoir le RSA ou la prime
d'activité *augmente* le score dans la version 2026.

> **C'est exactement le contre-modèle sur lequel MonParcours est construit.**
> Voir §5.3 : le score n'est jamais montré au citoyen, l'explication ne peut
> citer que des preuves extraites du dossier, et un invariant testé l'interdit
> d'inventer un fait. On ne score pas une personne : on analyse un dossier.

### 4.6 TAMM 4.0 (Abu Dhabi) — le seul qui va plus loin, et sur quoi

Le plus avancé du panel : assistant IA agentique multilingue, 1000+ services,
graphiques interactifs dans la conversation, et surtout **AutoGov** — le système
sait quand un document doit être renouvelé et exécute la démarche et le paiement
sans demande.

> **Ce qu'on ne battra pas** : le périmètre (1000+ services) et la proactivité.
> **Écarts exploitables** : (a) TAMM tourne sur Microsoft/Azure — inacceptable
> comme référence de souveraineté pour un service public français ; (b) TAMM est
> un front-office citoyen : la décision d'attribution d'une prestation sociale
> contestable et son explication motivée ne sont pas son sujet ; (c) le cadre
> juridique émirati n'impose ni RGPD art. 22, ni AI Act.

### 4.7 Albert / « L'Assistant » (DINUM) — la leçon à ne pas répéter

Albert a été testé par les conseillers de 48 maisons France Services. **Début
2026, la DINUM a annoncé qu'il ne serait pas généralisé en l'état**, face aux
critiques sur la fiabilité des résultats. Le projet a muté en « Assistant IA »,
intégrant des modèles Mistral, expérimenté auprès de 10 000 agents publics
jusqu'en juin 2026, avec un bilan attendu à l'été 2026.

> **Ce qu'il faut en retenir, littéralement** : un LLM souverain ne suffit pas.
> Ce qui a manqué, c'est l'ancrage vérifiable. MonParcours attaque précisément ce
> point : RAG hybride avec **citations de sources**, corpus officiel CAF /
> service-public.fr, **et un knowledge graph du Code de la construction et de
> l'habitation (Livre VIII)** qui permet de répondre au niveau de l'article de
> loi, pas de la paraphrase.
> **Menace** : « L'Assistant » sera déployé pour tous les agents publics d'ici fin
> 2026. Il occupera le terrain de l'assistance *aux agents*, pas celui de
> l'instruction outillée.

### 4.8 Bürokratt (EE) / LifeSG (SG) — l'école proactive

Bürokratt : un réseau de chatbots vocalisés, « une porte d'entrée, plusieurs SI
en arrière-plan », pensé comme infrastructure réutilisable. LifeSG : 1,5 M
d'utilisateurs, parcours guidés par « moments de vie » (naissance, garde
d'enfant). L'Agenda numérique estonien 2030 vise des services qui « vous
atteignent au moment où vous en avez besoin ».

> **Ce qu'on ne fait pas** : la proactivité. MonParcours est réactif — le citoyen
> vient. C'est le principal manque stratégique du produit (voir §7).

---

## 5. L'apport de valeur — cinq propositions défendables

### 5.1 Il couvre les deux faces du guichet

**Aucune** des sept solutions du panel n'expose le poste de travail de l'agent
instructeur. service-public.fr, GOV.UK, u.ae, mesdroitssociaux, TAMM sont des
front-offices citoyen ; le traitement se fait dans des SI métier fermés,
hétérogènes, non outillés par l'IA.

MonParcours implémente la chaîne entière dans un seul modèle de données :

```
citoyen                                          agent
───────                                          ─────
profilage adaptatif (LangGraph + Mistral)
   ↓
checklist personnalisée
   ↓
dépôt de pièces → OCR → complétude
   ↓
cohérence inter-documents (score + anomalies)
   ↓
fraude (async, mistral-large, ne bloque jamais) ──▶ file d'instruction
                                                       ↓
                                                    dossier + preuves extraites
                                                       ↓
notification ◀────── décision motivée ◀──────────── décision humaine
   ↓
contestation ─────────────────────────────────────▶ audit
```

**C'est le différenciateur structurel.** Il ne se rattrape pas par un
développement incrémental côté annuaire : il suppose un modèle de dossier partagé.

### 5.2 De l'IA documentaire, pas de l'IA documentation

Les assistants publics existants (U-Ask, GOV.UK Chat, Albert) répondent à des
questions sur des **fiches**. MonParcours analyse **les pièces du dossier** :

| Étage | Ce que ça produit | Modèle |
|---|---|---|
| OCR | texte des pièces scannées | `mistral-ocr-latest` |
| Classification | pièce ↔ ligne de checklist | `mistral-small-latest` |
| Complétude | déterministe, dérivée de la checklist | — |
| Cohérence | score 0–100 + anomalies + explication | `mistral-medium-latest` |
| Fraude | métadonnées PDF/image + verdict contextuel | `mistral-large-latest` |

Aucun portail du panel ne fait cela côté citoyen. C'est ce qui transforme
« déposez vos justificatifs et attendez trois semaines » en « il manque ceci, et
votre avis d'imposition ne concorde pas avec votre déclaration de ressources ».

**Valeur mesurable** : le taux de dossiers incomplets est le premier poste de
délai d'instruction. Le déplacer du back-office vers le moment du dépôt, c'est
le gain économique principal du produit.

### 5.3 Une explicabilité contrainte par construction — la réponse au dossier CAF

Trois garanties **inscrites dans les signatures de fonctions et verrouillées par
des tests**, pas dans une charte :

1. `generate_explanation` reçoit **la liste des preuves**, pas le dossier. Le
   modèle ne peut structurellement pas citer un fait qu'on ne lui a pas donné.
   Le test `test_explanation_cites_only_supplied_evidence` casse la CI si c'est violé.
2. **Le score IA n'est jamais restitué au citoyen.** Il oriente l'agent, il ne
   justifie rien.
3. Le **NIR est masqué dans une fonction unique** que toute réponse traverse.
4. Un rejet **exige** des preuves : rejeter un dossier propre renvoie `400`.

Face au datamining CNAF — score opaque sur *profil*, ouverture partielle,
recours au Conseil d'État, discrimination indirecte reconnue par le Défenseur des
droits — c'est le positionnement inverse : **l'IA analyse des pièces produites par
le dossier, pas des caractéristiques de la personne, et ne peut motiver qu'avec
ce qu'elle a extrait.**

C'est aussi, en pratique, ce que réclame l'**AI Act** : l'accès aux prestations
sociales essentielles est classé haut risque, ce qui impose explicabilité,
supervision humaine et traçabilité. MonParcours a les trois : explication
contrainte, décision prise par un humain, module `audit`.

### 5.4 Une réponse ancrée au niveau de l'article de loi

Là où Albert a échoué sur la fiabilité, la chaîne de réponse est :

```
question → routage d'intention (mistral-small, JSON, 4 intentions)
              ├─ générale ─▶ BM25 + Qdrant ─▶ RRF (k=60) ─▶ génération citée
              ├─ juridique ─▶ knowledge graph CCH Livre VIII ─▶ article
              └─ dossier ──▶ services MonParcours (données réelles du citoyen)
```

Le **knowledge graph juridique** (Code de la construction et de l'habitation,
Livre VIII, plus les articles atteints par les liens inter-codes) est
l'élément qu'**aucune** solution du panel ne possède. Il permet de répondre
« l'article R. 8xx-xx dispose que… » plutôt que de paraphraser une fiche.

Ajouté à cela : **embeddings locaux** (`paraphrase-multilingual-MiniLM-L12-v2`,
384 dim), donc pas d'appel réseau sur la requête ; **Mistral fournisseur unique**,
donc une seule clé, une seule juridiction. Comparé à TAMM sur Azure, c'est la
seule configuration présentable devant une DSI publique française.

### 5.5 L'accessibilité comme fonction, pas comme conformité

Tous les portails du panel sont conformes RGAA/WCAG — c'est une obligation
légale, ce n'est pas un différenciateur. Ce qui l'est :

- un **assistant vocal de bout en bout** (Whisper STT + TTS Mistral, push-to-talk,
  onboarding vocal après connexion) ;
- le vocal **replié sur le chatbot** : une phrase sans intention applicative
  reconnue part au RAG et la réponse est lue à voix haute ;
- **7 préférences d'accessibilité persistées** (contraste élevé, texte agrandi,
  focus renforcé, animations réduites).

Bürokratt vise la même chose et reste expérimental. Pour un public APL — dont une
part significative est en situation d'illectronisme — c'est un accès, pas un confort.

---

## 6. Synthèse : la phrase de positionnement

> **service-public.fr vous dit quoi faire. mesdroitssociaux.gouv.fr vous dit à quoi
> vous avez droit. caf.fr vous laisse déposer. Aucun ne vous dit pourquoi votre
> dossier bloque, et aucun n'outille l'agent qui le décide.**
>
> **MonParcours est le seul à couvrir la chaîne complète — dépôt, analyse
> documentaire par IA, instruction, décision motivée, contestation — avec une
> explication qui ne peut citer que les preuves du dossier.**

---

## 7. Ce que MonParcours ne fait pas (à dire avant qu'on nous le dise)

Un benchmark qui ne liste que des avantages n'est pas un benchmark.

| Manque | Gravité | Commentaire |
|---|:--:|---|
| **FranceConnect non branché** | 🔴 bloquant | Le bouton existe côté frontend, rien derrière. Sans identité régalienne, pas de mise en production. C'est le premier chantier. |
| **Couverture : 2 administrations câblées** (CAF, France Travail) sur 13 déclarées | 🔴 | Face à 220+ (GOV.UK) et 1000+ (TAMM), l'argument « multi-administrations » est aujourd'hui une architecture, pas un fait. À formuler comme tel. |
| **Aucune interop avec les SI métier réels** | 🔴 | Pas d'API Particulier, pas de connexion CNAF/DGFiP. Les données sont déclaratives + pièces jointes, là où mesdroitssociaux lit déjà les comptes. |
| **Aucune proactivité** | 🟠 | Estonie et TAMM (AutoGov) définissent l'état de l'art ; MonParcours est purement réactif. Le socle (checklist + profil + dossier) permettrait de le construire. |
| **Pas de mobile natif ni de wallet** | 🟠 | GOV.UK Wallet et TAMM sont mobile-first. |
| **Pas de CI, pas de conteneurisation** | 🟠 | Voir [`solution-status-and-roadmap.md`](solution-status-and-roadmap.md) §4.5. |
| **Corpus RAG de 42 chunks** | 🟡 | Suffisant pour l'APL, à industrialiser dès la 3ᵉ administration. |

**Formulation recommandée en soutenance** : « MonParcours n'est pas un concurrent
de service-public.fr — c'est la couche d'instruction que service-public.fr n'a
jamais eu vocation à porter, démontrée de bout en bout sur l'APL. »

---

## 8. Menaces à 12–18 mois

1. **« L'Assistant » DINUM généralisé fin 2026** à tous les agents publics
   (Mistral, souverain). Il occupe l'assistance *aux agents* — pas l'instruction
   outillée. À surveiller : s'il gagne l'accès aux dossiers, l'écart §5.1 se réduit.
2. **mesdroitssociaux branche le dépôt réel.** C'est le scénario qui coûte le plus
   cher au positionnement. Réponse : l'IA documentaire (§5.2) et la face agent (§5.1).
3. **AI Act, obligations haut risque.** C'est un vent porteur, pas une menace :
   l'explicabilité contrainte (§5.3) devient une exigence réglementaire, et les
   solutions à score opaque devront se mettre en conformité.
4. **Ouverture du datamining CNAF + pression contentieuse.** Rend le sujet
   « IA et prestations sociales » politiquement sensible. Argumenter sur
   *analyse de pièces* vs *notation de personnes*, systématiquement.

---

## Sources

- [service-public.gouv.fr — Missions et valeurs](https://www.service-public.gouv.fr/P10002?lang=en)
- [GDS — GOV.UK One Login, 50 services](https://gds.blog.gov.uk/2024/11/12/gov-uk-one-login-celebrating-50-services) · [GDS/DWP 2026](https://gds.blog.gov.uk/2026/03/13/how-gds-and-dwp-worked-together-to-improve-gov-uk-one-login) · [Roadmap — GOV.UK App](https://roadmap-for-modern-digital-government.campaign.gov.uk/join-up-services/govuk-app)
- [u.ae — Services Directory](https://u.ae/en/Services-Directory)
- [mesdroitssociaux.gouv.fr — Votre simulateur](https://www.mesdroitssociaux.gouv.fr/votre-simulateur/) · [economie.gouv.fr — évaluer ses droits](https://www.economie.gouv.fr/particuliers/gerer-mon-argent/beneficier-daides-et-de-reductions-dimpots/evaluez-vos-droits-des-prestations-sociales-en-quelques-clics)
- [CNAF — Note explicative datamining 2026 (PDF)](https://www.caf.fr/sites/default/files/medias/cnaf/Note_explicative_datamining.pdf) · [La Quadrature du Net — Notation généralisée des allocataires](https://www.laquadrature.net/en/caf-generalized-rating-of-beneficiaries/) · [Clubic — la transparence s'arrête là](https://www.clubic.com/actualite-602446-oui-la-caf-a-ouvert-son-algorithme-mais-la-transparence-s-arrete-la.html)
- [Microsoft Source EMEA — TAMM et l'IA à Abu Dhabi](https://news.microsoft.com/source/emea/features/tamm-app-abu-dhabi-government-services/) · [Axios — UAE's big bet on AI](https://www.axios.com/2026/07/15/uae-ai-government-app-tamm)
- [Acteurs Publics — le parcours d'Albert IA](https://acteurspublics.fr/articles/de-chatbot-experimental-a-socle-interministeriel-pour-lia-de-letat-le-parcours-dalbert-ia/) · [Weka — Albert ne sera pas généralisé](https://www.weka.fr/actualite/administration/article/albert-l-outil-d-ia-generative-experimente-a-france-services-ne-sera-pas-generalise-209194/) · [info.gouv.fr — Accélérer l'IA dans l'État](https://www.info.gouv.fr/actualite/accelerer-l-ia-dans-l-etat-et-au-service-des-francais)
- [RIA Estonie — Proactive government services](https://www.ria.ee/en/state-information-system/personal-services/proactive-government-services) · [GovTech Singapore — LifeSG](https://www.tech.gov.sg/products-and-services/for-citizens/digital-services/lifesg/)
