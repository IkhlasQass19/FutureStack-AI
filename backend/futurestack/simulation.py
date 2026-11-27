"""A bounded, deterministic, open-loop discrete-event experiment. Times in ms."""

from collections import Counter, defaultdict
from math import ceil
import networkx as nx
import simpy
from .models import Architecture, Contract, Scenario


class NodeStats(Contract):
    visits: int
    mean_wait_ms: float
    peak_queue: int
    local_failures: int
    effective_replicas: int


class Result(Contract):
    offered_rps: float
    requests: int
    succeeded: int
    failed: int
    success_pct: float
    p95_ms: float | None
    monthly_usd: float
    budget_met: bool
    background_failed: int
    nodes: dict[str, NodeStats]
    bottleneck: str | None
    failure_paths: dict[str, int]
    single_points: list[str]
    assumptions: list[str]


def simulate(arch: Architecture, scenario: Scenario) -> Result:
    env = simpy.Environment()
    nodes = {c.id: c for c in arch.components}
    downstream = defaultdict(list)
    for edge in sorted(arch.edges, key=lambda e: (e.source, e.target)):
        downstream[edge.source].append(edge)
    impact = scenario.horizon / 24
    rate = scenario.rps * (1 + 2 * impact if scenario.kind == "traffic-growth" else 1)
    end = scenario.duration_s * 1000
    replicas = {k: v.replicas for k, v in nodes.items()}

    def spend():
        return sum(nodes[k].monthly_usd * count for k, count in replicas.items())

    cap = scenario.budget_usd
    if scenario.kind == "budget-cap":
        cap = spend() + (cap - spend()) * impact
        for key in sorted(nodes, key=lambda n: (-nodes[n].monthly_usd, n)):
            while spend() > cap and replicas[key] > 1:
                replicas[key] -= 1
    resources = {
        k: simpy.Resource(env, capacity=c.slots * replicas[k]) for k, c in nodes.items()
    }
    target = None
    if scenario.kind in {"database-failure", "service-outage"}:
        kind = "database" if scenario.kind == "database-failure" else "service"
        target = scenario.target or next(
            (c.id for c in arch.components if c.kind == kind), None
        )
        if target not in nodes or nodes[target].kind != kind:
            raise ValueError(f"Select a {kind} component for this outage")
    outage_start, outage_end = end / 3, end / 3 + end * impact / 2
    visits, waits, peaks, failures, paths = (Counter() for _ in range(5))
    completed, background_failed = [], []

    def background(key, path):
        if not (yield env.process(visit(key, path))):
            background_failed.append(1)

    def visit(key, path):
        pool, c = resources[key], nodes[key]
        arrival = env.now
        visits[key] += 1
        chain = (*path, key)
        failed = len(pool.queue) >= 32
        if not failed:
            with pool.request() as req:
                peaks[key] = max(peaks[key], len(pool.queue))
                yield req
                waits[key] += env.now - arrival
                failed = (
                    key == target
                    and outage_start < outage_end
                    and env.now < outage_end
                    and env.now + c.service_ms > outage_start
                )
                yield env.timeout(c.service_ms)
        if failed:
            failures[key] += 1
            paths[" → ".join(chain)] += 1
            return False
        for edge in downstream[key]:
            latency = 2 + (100 * impact if scenario.kind == "network-latency" else 0)
            yield env.timeout(latency)
            if edge.mode == "async":
                env.process(background(edge.target, chain))
            elif not (yield env.process(visit(edge.target, chain))):
                return False
        return True

    def request():
        start = env.now
        if (yield env.process(visit(arch.entry, ()))):
            completed.append(env.now - start)

    count = max(1, round(rate * scenario.duration_s))

    def arrivals():
        for _ in range(count):
            env.process(request())
            yield env.timeout(1000 / rate)

    env.process(arrivals())
    env.run()
    stats = {
        k: NodeStats(
            visits=visits[k],
            mean_wait_ms=round(waits[k] / max(1, visits[k]), 2),
            peak_queue=peaks[k],
            local_failures=failures[k],
            effective_replicas=replicas[k],
        )
        for k in nodes
    }
    pressured = [k for k in nodes if peaks[k] > 0]
    critical = nx.descendants(arch.graph(sync_only=True), arch.entry) | {arch.entry}
    return Result(
        offered_rps=rate,
        requests=count,
        succeeded=len(completed),
        failed=count - len(completed),
        success_pct=round(100 * len(completed) / count, 2),
        monthly_usd=round(spend(), 2),
        budget_met=scenario.kind != "budget-cap" or spend() <= cap,
        background_failed=len(background_failed),
        p95_ms=round(sorted(completed)[ceil(0.95 * len(completed)) - 1], 2)
        if completed
        else None,
        nodes=stats,
        bottleneck=max(pressured, key=lambda k: stats[k].mean_wait_ms)
        if pressured
        else None,
        failure_paths=dict(paths),
        single_points=sorted(k for k in critical if replicas[k] == 1),
        assumptions=[
            "Fixed interarrival and service times. One FIFO pool per component, 32 waiting slots.",
            "All sync dependencies are required, visited serially in target ID order. Local capacity is released before downstream work.",
            "Async consumers drain independently. Failures there do not change an acknowledged request.",
            "The outage affects all replicas of its target. Work overlapping the window fails at service completion.",
            "Arrivals stop at the horizon of the short experiment. Queues drain before successful-request p95 is calculated.",
            "Month labels scale the chosen stress input. Monthly per-replica prices are illustrative, with a minimum of one replica.",
        ],
    )


def timeline(arch: Architecture, scenario: Scenario):
    return [
        {
            "month": month,
            "result": simulate(arch, scenario.model_copy(update={"horizon": month})),
        }
        for month in (0, 6, 12, 24)
    ]
