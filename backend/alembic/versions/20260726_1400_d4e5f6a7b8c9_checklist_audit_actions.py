"""checklist audit actions (personalised dossier generator)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-26 14:00:00.000000

No new table: the personalised checklist reuses the existing ``checklist_items``
table (already per-application). This migration only adds the two audit actions
the generator records.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op


revision: str = 'd4e5f6a7b8c9'
down_revision: str | None = 'c3d4e5f6a7b8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_NEW_AUDIT_ACTIONS = ('checklist_generated', 'checklist_updated')


def upgrade() -> None:
    # PG 12+ allows ADD VALUE inside a transaction as long as the value is not
    # *used* in the same transaction (it is not). IF NOT EXISTS keeps re-runs safe.
    for value in _NEW_AUDIT_ACTIONS:
        op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    # PostgreSQL cannot drop a single enum value, and rebuilding the type would
    # churn every column using it. The added values are harmless left in place.
    pass
