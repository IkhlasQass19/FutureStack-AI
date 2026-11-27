"""Pure review skills, shared by API, evaluation and read-only MCP."""

import networkx as nx
from pydantic import Field
from .models import Analysis, Architecture, Contract, Id, Text
from .evidence import Citation


class Inspection(Contract):
    request_path: list[str]
    single_points: list[str]
    lowest_capacity: str
    capacity_rps: dict[str, float]
    monthly_usd: float


def inspect(arch: Architecture):
    graph = arch.graph(sync_only=True)
    path = nx.descendants(graph, arch.entry) | {arch.entry}
    capacities = {
        c.id: round(c.replicas * c.slots * 1000 / c.service_ms, 2)
        for c in arch.components
    }
    return Inspection(
        request_path=list(nx.topological_sort(graph.subgraph(path))),
        single_points=sorted(
            c.id for c in arch.components if c.replicas == 1 and c.id in path
        ),
        lowest_capacity=min(capacities, key=capacities.get),
        capacity_rps=capacities,
        monthly_usd=round(sum(c.monthly_usd * c.replicas for c in arch.components), 2),
    )


class Advice(Contract):
    component: Id
    observation: Text
    recommendation: Text
    evidence_id: str = Field(max_length=96)
    support: Text


def grounding(advice, arch, sources):
    citation = next((s for s in sources if s.id == advice.evidence_id), None)
    if (
        not citation
        or advice.support not in citation.passage
        or len(advice.support) < 12
    ):
        raise ValueError("Evidence identifier or supporting passage is invalid")
    if advice.component not in arch.graph():
        raise ValueError("Finding refers to an unknown component")
    return citation


def specialist(topic, arch, source: Citation):
    graph = inspect(arch)
    if topic == "scaling":
        node = graph.lowest_capacity
        fact = f"{node} has the lowest nominal local capacity ({graph.capacity_rps[node]:g} visits/s)."
    elif topic == "security":
        node = next((c.id for c in arch.components if c.kind == "database"), arch.entry)
        fact = (
            f"The component contract for {node} does not specify data access policies."
        )
    else:
        c = max(arch.components, key=lambda c: c.replicas * c.monthly_usd)
        node = c.id
        fact = f"{node} accounts for ${c.replicas * c.monthly_usd:g} of the assumed ${graph.monthly_usd:g}/month."
    return Advice(
        component=node,
        observation=fact,
        recommendation=source.passage[:1200],
        evidence_id=source.id,
        support=source.passage[:800],
    )


def coverage(arch: Architecture, analysis: Analysis):
    valid = {r.id for r in analysis.requirements}
    links = {i for c in arch.components for i in c.requirements}
    return {
        "mapped": sorted(valid & links),
        "unmapped": sorted(valid - links),
        "unknown": sorted(links - valid),
    }


def diff(a: Architecture, b: Architecture):
    left = {c.id: c for c in a.components}
    right = {c.id: c for c in b.components}

    def edges(x):
        return {(e.source, e.target, e.protocol, e.mode) for e in x.edges}

    return {
        "added": sorted(right.keys() - left.keys()),
        "removed": sorted(left.keys() - right.keys()),
        "modified": {
            i: {
                k: {"before": v, "after": right[i].model_dump()[k]}
                for k, v in left[i].model_dump().items()
                if v != right[i].model_dump()[k]
            }
            for i in sorted(left.keys() & right.keys())
            if left[i] != right[i]
        },
        "edges_added": sorted(edges(b) - edges(a)),
        "edges_removed": sorted(edges(a) - edges(b)),
        "spec_changes": {
            k: {"before": a.model_dump()[k], "after": b.model_dump()[k]}
            for k in ("name", "style", "endpoints", "tables")
            if getattr(a, k) != getattr(b, k)
        },
    }
