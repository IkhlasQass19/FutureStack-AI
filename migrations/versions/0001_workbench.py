"""Initial immutable revisions, review checkpoints and vector evidence."""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "0001_workbench"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    pg = op.get_context().dialect.name == "postgresql"
    if pg:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created", sa.Float, nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("step", sa.Integer, nullable=False),
        sa.Column("head", sa.Integer, nullable=False),
        sa.Column("lease", sa.String(36)),
        sa.Column("until", sa.Float, nullable=False),
        sa.Column("state", sa.JSON, nullable=False),
    )
    op.create_table(
        "versions",
        sa.Column("run_id", sa.String(36), sa.ForeignKey("runs.id"), primary_key=True),
        sa.Column("number", sa.Integer, primary_key=True),
        sa.Column("architecture", sa.JSON, nullable=False),
    )
    op.create_table(
        "chunks",
        sa.Column("id", sa.String(96), primary_key=True),
        sa.Column("topic", sa.String(30), nullable=False),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("passage", sa.String(4000), nullable=False),
        sa.Column("embedding", Vector(256) if pg else sa.JSON, nullable=False),
    )


def downgrade():
    for table in ("versions", "chunks", "runs"):
        op.drop_table(table)
