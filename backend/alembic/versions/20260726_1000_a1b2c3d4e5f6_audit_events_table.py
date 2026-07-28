"""audit events table (immutable hash-chained trail)

Revision ID: a1b2c3d4e5f6
Revises: 8ea8b63c3139
Create Date: 2026-07-26 10:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a1b2c3d4e5f6'
down_revision: str | None = '8ea8b63c3139'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'audit_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('actor_user_id', sa.Integer(), nullable=True),
        sa.Column('actor_role', sa.String(length=32), nullable=False),
        sa.Column(
            'action',
            sa.Enum('dossier_submitted', 'decision_recorded', 'profile_updated', name='audit_action'),
            nullable=False,
        ),
        sa.Column('entity_type', sa.String(length=32), nullable=False),
        sa.Column('entity_id', sa.String(length=64), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('previous_hash', sa.String(length=64), nullable=False),
        sa.Column('event_hash', sa.String(length=64), nullable=False),
        # SET NULL, not CASCADE: the trail must outlive the account it references.
        sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_hash', name='uq_audit_events_event_hash'),
    )
    op.create_index('ix_audit_events_entity', 'audit_events', ['entity_type', 'entity_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_audit_events_entity', table_name='audit_events')
    op.drop_table('audit_events')
    # `drop_table` leaves the enum type behind in PostgreSQL — drop it too so the
    # downgrade is a clean round-trip and a re-upgrade can recreate it.
    sa.Enum(name='audit_action').drop(op.get_bind(), checkfirst=True)
