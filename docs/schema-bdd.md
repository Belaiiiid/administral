# Schéma de la base de données

Généré à partir des modèles SQLAlchemy (`backend/app/modules/*/models.py`,
enregistrés dans `backend/app/database/models.py`), puis complété par deux
extensions proposées (marquées **NOUVEAU** ci-dessous) qui comblent des trous
réels du produit sans remettre en cause l'architecture existante.

Les sessions de l'assistant de profilage (`features/citizen/profiling`) vivent
en mémoire (TTL, façon Redis) et n'apparaissent pas ici : elles ne sont pas
persistées en base.

## Pourquoi ce schéma et pas une fusion littérale de toutes les idées

- **Une seule table `users` + `role`**, pas de tables `AGENT_CAF`/`ADMIN`
  séparées : le rôle est la seule chose qui distingue un compte, une jointure
  en plus n'ajouterait rien.
- **`applications` (brouillon citoyen) séparée de `cases`** (instantané figé à
  l'instruction) : mutable et immuable ne doivent jamais être la même table.
- **Pas de table `CHECKLIST` intermédiaire** : `checklist_items` pointe
  directement sur `applications`.
- **`assessment` en JSONB sur `cases`**, pas une table à part : c'est un
  agrégat recalculé en bloc, jamais interrogé champ par champ.
- **`fraud_analysis`/`fraud_risk` en colonnes sur `case_documents`**, même
  raison — pas de table `SIGNAL_FRAUDE`.
- **`audit_events` chaîné par hash**, plutôt qu'un simple historique de
  statuts : il capture toute action métier (dossier, contestation, checklist,
  assessment…) et est infalsifiable.

Deux vrais manques ont en revanche été identifiés et ajoutés :

1. **`chatbot_conversations` / `chatbot_messages`** (NOUVEAU) — l'historique du
   chatbot n'est aujourd'hui jamais persisté (`chatbot/service.py` le reçoit
   à chaque requête depuis le frontend et l'oublie ensuite) : aucune reprise
   multi-appareil, aucun audit des échanges possible.
2. **`cases.assigned_agent_id`** (NOUVEAU) — aucune colonne n'assigne
   aujourd'hui un dossier à un agent précis ; `case_decisions.decided_by`
   n'est qu'un nom affiché, pas une clé étrangère.

```mermaid
erDiagram
    USERS ||--o| CITIZENS : "profil (optionnel)"
    USERS ||--o{ AUTH_TOKENS : emet
    USERS ||--o{ NOTIFICATIONS : recoit
    USERS ||--o| USER_SETTINGS : configure
    USERS |o--o{ AUDIT_EVENTS : "agit (optionnel)"
    USERS |o--o{ CASES : "instruit (NOUVEAU, optionnel)"
    USERS |o--o{ CHATBOT_CONVERSATIONS : "ouvre (NOUVEAU, optionnel)"

    CITIZENS ||--o{ CASES : depose
    CITIZENS |o--o{ APPLICATIONS : assemble
    CITIZENS ||--o{ CONTESTATIONS : conteste

    CASES ||--o{ CASE_DOCUMENTS : contient
    CASES ||--o| COMPLETENESS_REPORTS : a
    CASES ||--o| COHERENCE_REPORTS : a
    CASES ||--o| CASE_DECISIONS : a
    CASES ||--o{ CONTESTATIONS : "est contestee"

    COMPLETENESS_REPORTS ||--o{ COMPLETENESS_ITEMS : liste
    COHERENCE_REPORTS ||--o{ COHERENCE_ANOMALIES : liste
    CASE_DECISIONS ||--o{ DECISION_EVIDENCE : cite
    CASE_DECISIONS |o--o{ CONTESTATIONS : "decision contestee (optionnel)"

    APPLICATIONS ||--o{ APPLICATION_DOCUMENTS : contient
    APPLICATIONS ||--o{ CHECKLIST_ITEMS : requiert

    CHATBOT_CONVERSATIONS ||--o{ CHATBOT_MESSAGES : contient

    USERS {
        int id PK
        string first_name
        string last_name
        string email UK
        string password_hash
        string role "CITIZEN | AGENT | ADMIN"
        bool is_verified
    }

    AUTH_TOKENS {
        int id PK
        int user_id FK
        string purpose "EMAIL_VERIFICATION | PASSWORD_RESET"
        string token_hash UK
        datetime expires_at
        datetime used_at
    }

    USER_SETTINGS {
        int id PK
        int user_id FK,UK
        bool email_notifications
        bool ai_assistance
        bool cross_administration_sharing
    }

    NOTIFICATIONS {
        int id PK
        int user_id FK
        string type
        string title
        string body
        string reference
        bool read
    }

    AUDIT_EVENTS {
        int id PK
        datetime occurred_at
        int actor_user_id FK
        string actor_role
        string action
        string entity_type
        string entity_id
        string summary
        json payload
        string previous_hash
        string event_hash UK
    }

    CITIZENS {
        string id PK
        int user_id FK,UK
        string first_name
        string last_name
        string email UK
        date birth_date
        string social_security_number
        json profile_data
    }

    APPLICATIONS {
        string id PK
        string citizen_id FK
        string service_id
        string status "incomplete | complete"
        string checklist_version
    }

    APPLICATION_DOCUMENTS {
        string id PK
        string application_id FK
        string file_name
        string mime_type
        int size_bytes
        string stored_path
        string status
        json classification
        string matched_checklist_item_id
    }

    CHECKLIST_ITEMS {
        string id PK
        string application_id FK
        string item_key
        string libelle
        string categorie
        bool obligatoire
        bool received
        int position
    }

    CASES {
        string id PK
        string application_number UK
        string status
        datetime submitted_at
        string citizen_id FK
        int assigned_agent_id FK "NOUVEAU — nullable"
        string service_id
        string service_label
        int score_value
        string score_band
        string marital_status
        int dependent_children
        string occupancy_status
        int annual_income
        json assessment
    }

    CASE_DOCUMENTS {
        string id PK
        string case_id FK
        string requirement_id
        string file_name
        string status
        json fraud_analysis
        string fraud_risk
    }

    COMPLETENESS_REPORTS {
        string id PK
        string case_id FK,UK
        string outcome
        datetime checked_at
        int completion_rate
    }

    COMPLETENESS_ITEMS {
        string id PK
        string report_id FK
        string item_key
        string label
        bool received
        bool required
    }

    COHERENCE_REPORTS {
        string id PK
        string case_id FK,UK
        string outcome
        datetime checked_at
        int coherence_score
        string ai_explanation
    }

    COHERENCE_ANOMALIES {
        string id PK
        string report_id FK
        string severity
        string field
        string declared_value
        string observed_value
    }

    CASE_DECISIONS {
        string id PK
        string case_id FK,UK
        string outcome "validated | rejected"
        string explanation
        string decided_by
        datetime created_at
    }

    DECISION_EVIDENCE {
        string id PK
        string decision_id FK
        string field
        string value
        string source
    }

    CONTESTATIONS {
        string id PK
        string dossier_id FK
        string citizen_id FK
        string original_decision_id FK
        string reason
        string description
        string status "PENDING | UNDER_REVIEW | ACCEPTED | REJECTED"
        string reviewed_by
        string resolution_comment
    }

    CHATBOT_CONVERSATIONS {
        string id PK
        int user_id FK "NOUVEAU — nullable, chat anonyme autorise"
        datetime started_at
    }

    CHATBOT_MESSAGES {
        string id PK
        string conversation_id FK
        string role "user | assistant"
        string content
        json sources
        datetime created_at
    }
```

## Points à noter

- `users` ↔ `citizens` est un 1:1 **optionnel dans les deux sens** : un citoyen
  seedé peut n'avoir aucun compte, un compte peut n'avoir encore aucun profil.
- `cases` est un **instantané figé** à la soumission — il ne suit pas les
  modifications ultérieures de `citizens.profile_data`.
- `original_decision_id` sur `contestations` est en `SET NULL` : une
  redécision ne doit jamais faire disparaître une contestation en cours.
- `audit_events` est **append-only**, chaîné par hash (`previous_hash` →
  `event_hash`) ; `actor_user_id` est en `SET NULL` pour que le journal
  survive à la suppression d'un compte.

## Extensions proposées (non implémentées) — à valider avant migration

| Ajout | Table / colonne | Détail |
|---|---|---|
| Historique du chatbot | `chatbot_conversations`, `chatbot_messages` | `chatbot_conversations.user_id` en `SET NULL` (nullable — le chat anonyme est autorisé, voir `chatbot/router.py` : `get_current_user_optional`). `chatbot_messages.sources` reprend le JSON de citations déjà renvoyé par `ChatbotResponseSchema`. |
| Assignation agent | `cases.assigned_agent_id` | FK nullable vers `users.id`, `ON DELETE SET NULL` — un agent qui quitte ne doit pas bloquer la suppression de son compte ni supprimer les dossiers déjà instruits. |

Volontairement écarté de la proposition initiale : un flag `resolue` par
anomalie (`coherence_anomalies`) — les rapports de cohérence sont recalculés
en bloc à chaque changement de document, pas résolus anomalie par anomalie ;
ajouter ce flag introduirait un état qui pourrait diverger du rapport réel.
