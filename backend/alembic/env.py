"""Alembic environment.

Two things differ from the generated default, both deliberate:

1. The connection URL comes from ``app.core.config`` rather than
   ``alembic.ini``. One source of truth for credentials, and none of them in a
   committed file.

2. ``target_metadata`` is imported via ``app.database.models``, which imports
   every model. Autogenerate diffs ``Base.metadata`` against the live database,
   so a model that nothing imported is missing from that metadata — and
   autogenerate would emit a migration dropping its table.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.database.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to stdout without connecting — ``alembic upgrade head --sql``."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Without this, a column whose type changed is not detected and the
            # migration silently omits it.
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
