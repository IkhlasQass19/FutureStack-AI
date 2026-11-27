from __future__ import annotations

from typing import Annotated, Literal
import networkx as nx
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Contract(BaseModel):
    model_config = ConfigDict(
        extra="forbid", str_strip_whitespace=True, allow_inf_nan=False
    )


Id = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_-]{0,39}$")]
Text = Annotated[str, Field(min_length=1, max_length=1400)]
Style = Literal["monolith", "microservices", "event-driven"]
Kind = Literal["gateway", "service", "database", "queue", "worker"]


class Brief(Contract):
    text: str = Field(min_length=12, max_length=6000)
    style: Style = "microservices"


class Requirement(Contract):
    id: Id
    text: Text
    category: Literal["functional", "non-functional"]


class Analysis(Contract):
    requirements: list[Requirement] = Field(min_length=1, max_length=40)
    missing: list[Text] = Field(max_length=20)
    assumptions: list[Text] = Field(max_length=20)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({r.id for r in self.requirements}) != len(self.requirements):
            raise ValueError("Requirement IDs must be unique")
        return self


class Component(Contract):
    id: Id
    name: str = Field(min_length=1, max_length=90)
    kind: Kind
    technology: Text
    rationale: Text
    requirements: list[Id] = Field(default_factory=list, max_length=40)
    replicas: int = Field(default=1, ge=1, le=32)
    slots: int = Field(default=2, ge=1, le=64)
    service_ms: int = Field(default=40, ge=1, le=5000)
    monthly_usd: float = Field(default=40, ge=0, le=100000)
    x: float = Field(default=0, ge=-10000, le=10000)
    y: float = Field(default=0, ge=-10000, le=10000)


class Edge(Contract):
    source: Id
    target: Id
    mode: Literal["sync", "async"] = "sync"
    protocol: Text = "HTTPS"


class Endpoint(Contract):
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    path: str = Field(pattern=r"^/[a-zA-Z0-9/{}_\-]*$", max_length=200)
    purpose: Text
    request: Text
    response: Text


class Table(Contract):
    name: Id
    columns: list[Text] = Field(min_length=1, max_length=30)


class Architecture(Contract):
    name: str = Field(min_length=1, max_length=100)
    style: Style
    components: list[Component] = Field(min_length=1, max_length=24)
    edges: list[Edge] = Field(max_length=48)
    endpoints: list[Endpoint] = Field(max_length=32)
    tables: list[Table] = Field(max_length=32)

    def graph(self, sync_only=False):
        graph = nx.DiGraph()
        graph.add_nodes_from(c.id for c in self.components)
        graph.add_edges_from(
            (e.source, e.target)
            for e in self.edges
            if not sync_only or e.mode == "sync"
        )
        return graph

    @property
    def entry(self):
        return next(c.id for c in self.components if c.kind == "gateway")

    @model_validator(mode="after")
    def validate_graph(self):
        ids = {c.id for c in self.components}
        pairs = {(e.source, e.target) for e in self.edges}
        if len(ids) != len(self.components) or len(pairs) != len(self.edges):
            raise ValueError("Duplicate component or dependency")
        if any(source not in ids or target not in ids for source, target in pairs):
            raise ValueError("Dependency refers to an unknown component")
        if sum(c.kind == "gateway" for c in self.components) != 1:
            raise ValueError("Exactly one gateway is required")
        graph = self.graph()
        if (
            not nx.is_directed_acyclic_graph(graph)
            or len(nx.descendants(graph, self.entry)) != len(ids) - 1
        ):
            raise ValueError("Use a directed acyclic graph reachable from the gateway")
        visits = {node: 0 for node in ids}
        visits[self.entry] = 1
        for node in nx.topological_sort(graph):
            for target in graph[node]:
                visits[target] += visits[node]
        if sum(visits.values()) > 64:
            raise ValueError(
                "A request may visit at most 64 component instances along its paths"
            )
        return self


class Scenario(Contract):
    kind: Literal[
        "baseline",
        "traffic-growth",
        "database-failure",
        "network-latency",
        "service-outage",
        "budget-cap",
    ] = "traffic-growth"
    rps: int = Field(default=24, ge=1, le=60)
    duration_s: int = Field(default=12, ge=3, le=25)
    horizon: Literal[0, 6, 12, 24] = 12
    target: Id | None = None
    budget_usd: float = Field(default=200, ge=1, le=1000000)


class SimulationInput(Contract):
    architecture: Architecture
    scenario: Scenario
