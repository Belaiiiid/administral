"""contestations table + audit/notification enum values (droit de contestation)

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-07-26 12:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c3d4e5f6a7b8'
down_revision: str | None = 'a1b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# New members of two existing PostgreSQL enums. Added with ADD VALUE (PG 12+
# allows this inside a transaction as long as the new value is not *used* in the
# same transaction — it is not here). IF NOT EXISTS keeps a re-run harmless.
_NEW_AUDIT_ACTIONS = (
    'contestation_created',
    'contestation_review_started',
    'contestation_resolved',
)
_NEW_NOTIFICATION_TYPES = (
    'contestation_filed',
    'contestation_resolved',
)


def upgrade() -> None:
    for value in _NEW_AUDIT_ACTIONS:
        op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")
    for value in _NEW_NOTIFICATION_TYPES:
        op.execute(f"ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '{value}'")

    op.create_table(
        'contestations',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('dossier_id', sa.String(length=64), nullable=False),
        sa.Column('citizen_id', sa.String(length=64), nullable=False),
        sa.Column('original_decision_id', sa.String(length=64), nullable=True),
        sa.Column(
            'reason',
            sa.Enum(
                'erreur_appreciation',
                'piece_non_prise_en_compte',
                'erreur_calcul',
                'changement_situation',
                'autre',
                name='contestation_reason',
            ),
            nullable=False,
        ),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column(
            'status',
            sa.Enum(
                'PENDING', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', name='contestation_status'
            ),
            nullable=False,
        ),
        sa.Column('reviewed_by', sa.String(length=255), nullable=True),
        sa.Column('resolution_comment', sa.Text(), nullable=True),
        # TimestampMixin
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        # CASCADE from the dossier and the applicant; SET NULL from the decision,
        # which can be replaced when an agent re-decides (see the model docstring).
        sa.ForeignKeyConstraint(['dossier_id'], ['cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['citizen_id'], ['citizens.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['original_decision_id'], ['case_decisions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_contestations_status', 'contestations', ['status'], unique=False)
    op.create_index('ix_contestations_dossier_id', 'contestations', ['dossier_id'], unique=False)
    op.create_index('ix_contestations_citizen_id', 'contestations', ['citizen_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_contestations_citizen_id', table_name='contestations')
    op.drop_index('ix_contestations_dossier_id', table_name='contestations')
    op.drop_index('ix_contestations_status', table_name='contestations')
    op.drop_table('contestations')
    # Drop the two enum types this migration introduced so the downgrade is a
    # clean round-trip.
    sa.Enum(name='contestation_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='contestation_reason').drop(op.get_bind(), checkfirst=True)
    # The values added to audit_action / notification_type are left in place:
    # PostgreSQL cannot DROP a single enum value, and rebuilding those types
    # would churn every column that uses them. A superset enum is harmless.
