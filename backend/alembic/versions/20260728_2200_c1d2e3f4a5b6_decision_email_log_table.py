"""decision email log table

Revision ID: c1d2e3f4a5b6
Revises: 09de8957ab36
Create Date: 2026-07-28 22:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4a5b6'
down_revision: str | None = '09de8957ab36'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'decision_email_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('application_id', sa.String(length=64), nullable=False),
        sa.Column('citizen_id', sa.String(length=64), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('status', sa.Enum('sent', 'failed', name='email_delivery_status'), nullable=False),
        sa.Column('generated_reason', sa.Text(), nullable=False),
        sa.Column('delivery_error', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['application_id'], ['cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['citizen_id'], ['citizens.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_decision_email_log_application_id',
        'decision_email_log',
        ['application_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_decision_email_log_application_id', table_name='decision_email_log')
    op.drop_table('decision_email_log')
    # `drop_table` leaves the enum type behind in PostgreSQL — drop it too so the
    # downgrade is a clean round-trip and a re-upgrade can recreate it.
    sa.Enum(name='email_delivery_status').drop(op.get_bind(), checkfirst=True)
