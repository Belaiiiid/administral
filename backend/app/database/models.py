"""Model registry.

Alembic's autogenerate compares ``Base.metadata`` against the live database. A
model class that no module has imported is absent from that metadata, so
autogenerate cheerfully emits a migration *dropping* its table.

Importing every model here, and importing this module from ``alembic/env.py``,
is what prevents that. It is the one place where a new module's models must be
registered — a single line, but a required one.
"""

from __future__ import annotations

from app.database.base import Base
from app.modules.audit.models import AuditEvent
from app.modules.contestation.models import Contestation
from app.modules.agent.models import (
    Case,
    CaseDecision,
    CaseDocument,
    Citizen,
    CoherenceAnomaly,
    CoherenceReport,
    CompletenessItem,
    CompletenessReport,
    DecisionEvidence,
)
from app.modules.citizen.models import (
    Application,
    ApplicationDocument,
    ChecklistItem,
)
from app.modules.auth.models import AuthToken, User
from app.modules.notifications.models import Notification
from app.modules.settings.models import UserSettings

# Re-exported so `from app.database.models import Base` reaches the metadata
# with every table attached.
__all__ = [
    "Base",
    "Case",
    "CaseDecision",
    "CaseDocument",
    "Citizen",
    "CoherenceAnomaly",
    "CoherenceReport",
    "CompletenessItem",
    "CompletenessReport",
    "DecisionEvidence",
    # Citizen module (pre-Case document assembly)
    "Application",
    "ApplicationDocument",
    "ChecklistItem",
    # Auth module
    "User",
    "AuthToken",
    # Notifications module
    "Notification",
    # Settings module
    "UserSettings",
    # Audit module
    "AuditEvent",
    # Contestation module
    "Contestation",
]
