"""Index curated notes offline or refresh the allowlisted public documentation."""

import argparse
from hashlib import blake2b, sha256
from html.parser import HTMLParser
import math
import re
import httpx
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from .config import Settings
from .models import Contract
from .storage import Store, chunks

CATALOG = {
    "scaling": (
        "Queue-based load leveling",
        "https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling",
        "A queue absorbs bursts between producers and consumers. Bound consumer throughput and monitor queue depth to avoid overloading downstream capacity.",
    ),
    "reliability": (
        "Distributed dependency failures",
        "https://docs.aws.amazon.com/wellarchitected/latest/framework/rel05.html",
        "Use bounded retries, timeouts and load shedding on remote dependencies. Graceful degradation can reduce the effect of a dependency outage.",
    ),
    "security": (
        "PostgreSQL row security",
        "https://www.postgresql.org/docs/current/ddl-rowsecurity.html",
        "Table privileges and row security policies control access to records. A table owner normally bypasses row security. Test access with the application's least-privileged role.",
    ),
    "cost": (
        "Cost optimization design patterns",
        "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/design-patterns",
        "Scale consumers to demand and use queue-based load leveling to reduce overprovisioning. Compare resource savings with added operational overhead.",
    ),
}


class Citation(Contract):
    id: str
    title: str
    url: str
    passage: str


def embed(text):
    v = [0.0] * 256
    for token in re.findall(r"[a-z0-9]+", text.lower()):
        digest = blake2b(token.encode(), digest_size=4).digest()
        v[int.from_bytes(digest, "big") % 256] += 1
    norm = math.sqrt(sum(n * n for n in v)) or 1
    return [n / norm for n in v]


def passages(text, size=95, overlap=15):
    words = text.split()
    for i in range(0, len(words), size - overlap):
        yield " ".join(words[i : i + size])[:3900]
        if i + size >= len(words):
            break


class Article(HTMLParser):
    def __init__(self):
        super().__init__()
        self.words, self.ignored = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "footer", "header"):
            self.ignored += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "footer", "header"):
            self.ignored = max(0, self.ignored - 1)

    def handle_data(self, data):
        if not self.ignored and data.strip():
            self.words.append(data.strip())


def download(url):
    with httpx.stream("GET", url, timeout=20, follow_redirects=False) as r:
        r.raise_for_status()
        data = bytearray()
        for piece in r.iter_bytes():
            data.extend(piece)
            if len(data) > 3_000_000:
                raise ValueError("Source exceeds ingestion limit")
    parser = Article()
    parser.feed(data.decode("utf-8", errors="replace"))
    content = " ".join(parser.words)
    if len(content) < 300:
        raise ValueError("No substantive source text")
    return content


def ingest(store, live=False):
    dialect = store.engine.dialect.name
    put = pg_insert if dialect == "postgresql" else sqlite_insert
    for topic, (title, url, note) in CATALOG.items():
        text = download(url) if live else note
        rows = []
        for passage in passages(text):
            key = (
                topic
                + ("-web-" if live else "-note-")
                + sha256(passage.encode()).hexdigest()[:18]
            )
            rows.append(
                dict(
                    id=key,
                    topic=topic,
                    title=title,
                    url=url,
                    passage=passage,
                    embedding=embed(passage),
                )
            )
        with store.engine.begin() as db:
            if live:
                db.execute(
                    delete(chunks).where(
                        chunks.c.topic == topic, chunks.c.id.like("%-web-%")
                    )
                )
            for row in rows:
                db.execute(
                    put(chunks)
                    .values(**row)
                    .on_conflict_do_nothing(index_elements=["id"])
                )


def retrieve(store, query, topic=None, k=3):
    vector = embed(query)
    stmt = select(chunks)
    if topic:
        stmt = stmt.where(chunks.c.topic == topic)
    with store.engine.connect() as db:
        if store.engine.dialect.name == "postgresql":
            rows = (
                db.execute(
                    stmt.order_by(
                        chunks.c.embedding.cosine_distance(vector), chunks.c.id
                    ).limit(k)
                )
                .mappings()
                .all()
            )
        else:
            rows = sorted(
                db.execute(stmt).mappings(),
                key=lambda r: (
                    -sum(a * b for a, b in zip(r["embedding"], vector)),
                    r["id"],
                ),
            )[:k]
    return [
        Citation(**{k: r[k] for k in ("id", "title", "url", "passage")}) for r in rows
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live", action="store_true", help="Download the four allowlisted sources"
    )
    args = parser.parse_args()
    store = Store(Settings().database_url)
    store.setup_demo()
    ingest(store, args.live)
    print("Evidence index updated")
