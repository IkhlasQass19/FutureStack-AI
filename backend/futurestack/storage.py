from time import time
from uuid import uuid4
from sqlalchemy import (
    JSON,
    Column,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    create_engine,
    insert,
    select,
    update,
)
from sqlalchemy.pool import StaticPool
from pgvector.sqlalchemy import Vector
from .models import Architecture, Brief

metadata = MetaData()
runs = Table(
    "runs",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("created", Float, nullable=False),
    Column("status", String(24), nullable=False),
    Column("step", Integer, nullable=False),
    Column("head", Integer, nullable=False),
    Column("lease", String(36)),
    Column("until", Float, nullable=False),
    Column("state", JSON, nullable=False),
)
versions = Table(
    "versions",
    metadata,
    Column("run_id", ForeignKey("runs.id"), primary_key=True),
    Column("number", Integer, primary_key=True),
    Column("architecture", JSON, nullable=False),
)
chunks = Table(
    "chunks",
    metadata,
    Column("id", String(96), primary_key=True),
    Column("topic", String(30), nullable=False),
    Column("title", String(180), nullable=False),
    Column("url", String(500), nullable=False),
    Column("passage", String(4000), nullable=False),
    Column("embedding", Vector(256).with_variant(JSON(), "sqlite"), nullable=False),
)


class Conflict(Exception):
    pass


class Store:
    def __init__(self, url):
        kw = {"pool_pre_ping": True}
        if url.startswith("sqlite"):
            kw["connect_args"] = {"check_same_thread": False, "timeout": 15}
            if ":memory:" in url:
                kw["poolclass"] = StaticPool
        self.engine = create_engine(url, **kw)

    def setup_demo(self):
        if self.engine.dialect.name == "sqlite":
            metadata.create_all(self.engine)

    def create(self, brief: Brief):
        key = str(uuid4())
        with self.engine.begin() as db:
            db.execute(
                insert(runs).values(
                    id=key,
                    created=time(),
                    status="ready",
                    step=0,
                    head=0,
                    until=0,
                    state={"brief": brief.model_dump(), "findings": [], "traces": []},
                )
            )
        return self.read(key)

    def read(self, key):
        with self.engine.connect() as db:
            row = db.execute(select(runs).where(runs.c.id == key)).mappings().first()
        if row is None:
            raise KeyError("Unknown run")
        return {k: v for k, v in row.items() if k not in ("lease", "until")}

    def recent(self):
        with self.engine.connect() as db:
            return [
                dict(r)
                for r in db.execute(
                    select(runs.c.id, runs.c.created, runs.c.status, runs.c.head)
                    .order_by(runs.c.created.desc())
                    .limit(50)
                ).mappings()
            ]

    def claim(self, key):
        token = str(uuid4())
        with self.engine.begin() as db:
            changed = db.execute(
                update(runs)
                .where(
                    runs.c.id == key,
                    runs.c.status.in_(["ready", "failed", "running"]),
                    runs.c.until < time(),
                )
                .values(lease=token, until=time() + 300, status="running")
            )
            if changed.rowcount != 1:
                raise Conflict("Run is already active or has finished review")
        return token

    def checkpoint(self, key, token, step, state, status):
        done = status != "running"
        with self.engine.begin() as db:
            changed = db.execute(
                update(runs)
                .where(runs.c.id == key, runs.c.lease == token)
                .values(
                    step=step,
                    state=state,
                    status=status,
                    until=0 if done else time() + 300,
                    lease=None if done else token,
                )
            )
            if changed.rowcount != 1:
                raise Conflict("Workflow lease expired")

    def save(self, key, base, arch: Architecture):
        expected = "awaiting_approval" if base == 0 else "approved"
        with self.engine.begin() as db:
            changed = db.execute(
                update(runs)
                .where(runs.c.id == key, runs.c.head == base, runs.c.status == expected)
                .values(head=base + 1, status="approved")
            )
            if changed.rowcount != 1:
                raise Conflict(
                    "Revision or approval state changed. Reload the latest version."
                )
            db.execute(
                insert(versions).values(
                    run_id=key, number=base + 1, architecture=arch.model_dump()
                )
            )
        return base + 1

    def version(self, key, number):
        with self.engine.connect() as db:
            value = db.scalar(
                select(versions.c.architecture).where(
                    versions.c.run_id == key, versions.c.number == number
                )
            )
        if value is None:
            raise KeyError("Unknown architecture revision")
        return Architecture.model_validate(value)
