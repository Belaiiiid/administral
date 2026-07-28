"""case assessment columns + assessment audit actions (MonParcours Result)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-26 16:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e5f6a7b8c9d0'
down_revision: str | None = 'd4e5f6a7b8c9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_NEW_AUDIT_ACTIONS = ('assessment_generated', 'assessment_updated')


def upgrade() -> None:
    # ADD VALUE inside a transaction is allowed on PG 12+ as long as the value is
    # not used in the same transaction (it is not). IF NOT EXISTS keeps re-runs safe.
    for value in _NEW_AUDIT_ACTIONS:
        op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")

    op.add_column(
        'cases',
        sa.Column('assessment', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        'cases',
        sa.Column('assessment_computed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('cases', 'assessment_computed_at')
    op.drop_column('cases', 'assessment')
    # Enum values are left in place: PostgreSQL cannot drop a single value, and a
    # superset enum is harmless.
