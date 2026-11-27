"""Credential-free, deterministic brief parser and architecture patterns."""

import re
from .models import (
    Analysis,
    Architecture,
    Brief,
    Component,
    Edge,
    Endpoint,
    Requirement,
    Table,
)

NFR = re.compile(
    r"latency|uptime|availability|secure|encrypt|audit|budget|concurrent|per second|\bms\b|\brps\b|percentile|retention|privacy|p95|scale|cost",
    re.I,
)
DOMAINS = [
    (r"ticket|venue|concert", "Ticketing", "reservation"),
    (r"order|shop|checkout|commerce", "Commerce", "order"),
    (r"sensor|telemetry|device", "Telemetry", "reading"),
    (r"appoint|clinic|patient", "Scheduling", "appointment"),
    (r"video|stream|media", "Media", "asset"),
]


def analyze(brief: Brief) -> Analysis:
    parts = [
        s.strip(" -•")
        for s in re.split(
            r"(?<=[.!?])\s+|[;\n]+|\s+and\s+(?=must\b|support\b|allow\b|keep\b)",
            brief.text,
        )
        if s.strip(" -•")
    ]
    if len(parts) > 40 or any(len(p) > 1400 for p in parts):
        raise ValueError(
            "Split the brief into at most 40 requirements of at most 1400 characters each"
        )
    reqs = [
        Requirement(
            id=f"r{i}",
            text=p,
            category="non-functional" if NFR.search(p) else "functional",
        )
        for i, p in enumerate(parts, 1)
    ]
    questions = [
        (
            r"\d+\s*(rps|requests per second)",
            "What peak request rate should the design sustain?",
        ),
        (r"p95|percentile", "What is the target p95 latency?"),
        (r"rpo|rto", "What are the recovery time and data loss objectives?"),
        (r"budget|\$", "What is the monthly infrastructure budget?"),
    ]
    return Analysis(
        requirements=reqs,
        missing=[q for pat, q in questions if not re.search(pat, brief.text, re.I)],
        assumptions=[
            "One region and a single write path.",
            "Service times, capacity and costs are illustrative inputs.",
        ],
    )


def generate(brief: Brief, analysis: Analysis) -> Architecture:
    domain, noun = next(
        ((d, n) for pat, d, n in DOMAINS if re.search(pat, brief.text, re.I)),
        ("Application", "record"),
    )
    functional = [r.id for r in analysis.requirements if r.category == "functional"]

    def node(
        id,
        name,
        kind,
        tech,
        reason,
        x,
        y,
        ms,
        cost,
        slots=2,
        replicas=1,
        requirements=None,
    ):
        return Component(
            id=id,
            name=name,
            kind=kind,
            technology=tech,
            rationale=reason,
            x=x,
            y=y,
            service_ms=ms,
            monthly_usd=cost,
            slots=slots,
            replicas=replicas,
            requirements=requirements or [],
        )

    app_name = f"{domain} application" if brief.style == "monolith" else f"{domain} API"
    nodes = [
        node(
            "edge",
            "Edge gateway",
            "gateway",
            "NGINX",
            "One ingress for request routing and TLS termination.",
            0,
            50,
            4,
            20,
            8,
        ),
        node(
            "api",
            app_name,
            "service",
            "FastAPI",
            f"Owns the {noun} write contract and input validation.",
            230,
            50,
            28,
            42,
            2,
            2,
            functional,
        ),
        node(
            "store",
            "Primary database",
            "database",
            "PostgreSQL",
            f"Transactions preserve the {noun} lifecycle.",
            690,
            50,
            55,
            80,
        ),
    ]
    edges = [Edge(source="edge", target="api")]
    if brief.style == "microservices":
        nodes.append(
            node(
                "ledger",
                f"{domain} ledger",
                "service",
                "Python / HTTP",
                "Isolates transactional state behind a single owner.",
                460,
                50,
                20,
                36,
            )
        )
        edges.extend(
            [
                Edge(source="api", target="ledger"),
                Edge(source="ledger", target="store", protocol="SQL/TLS"),
            ]
        )
    else:
        nodes[-1].x = 460
        edges.append(Edge(source="api", target="store", protocol="SQL/TLS"))
    if brief.style == "event-driven":
        nodes.extend(
            [
                node(
                    "events",
                    "Event broker",
                    "queue",
                    "RabbitMQ",
                    "Buffers acknowledged work between producer and consumer.",
                    460,
                    195,
                    8,
                    25,
                ),
                node(
                    "worker",
                    "Event consumer",
                    "worker",
                    "Python worker",
                    "Processes committed domain events outside the response path.",
                    690,
                    195,
                    70,
                    35,
                ),
            ]
        )
        edges.extend(
            [
                Edge(source="api", target="events", protocol="AMQP"),
                Edge(source="events", target="worker", mode="async", protocol="AMQP"),
            ]
        )
    return Architecture(
        name=f"{domain} platform",
        style=brief.style,
        components=nodes,
        edges=edges,
        endpoints=[
            Endpoint(
                method="POST",
                path=f"/{noun}s",
                purpose=f"Create a {noun}",
                request=f"{{client_id, {noun}_data}}",
                response="{id, status}",
            ),
            Endpoint(
                method="GET",
                path=f"/{noun}s/{{id}}",
                purpose=f"Read a {noun}",
                request="Path parameter id",
                response="{id, status, created_at}",
            ),
        ],
        tables=[
            Table(
                name=f"{noun}s",
                columns=[
                    "id UUID PRIMARY KEY",
                    "client_id TEXT",
                    "status TEXT",
                    "created_at TIMESTAMPTZ",
                ],
            )
        ],
    )
