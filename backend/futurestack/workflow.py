from __future__ import annotations
from time import perf_counter, sleep
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from pydantic import Field
from . import demo
from .config import Settings
from .evidence import retrieve
from .models import Analysis, Architecture, Brief, Contract, Text
from .providers import Provider, ProviderError, cost
from .skills import Advice, coverage, grounding, inspect, specialist
from .storage import Store
from .telemetry import log

STAGES = (
    "requirements_analyst",
    "system_architect",
    "scalability",
    "security",
    "cost_optimisation",
    "architecture_reviewer",
)
TOPICS = {"scalability": "scaling", "security": "security", "cost_optimisation": "cost"}


class Review(Contract):
    summary: Text
    follow_up: list[Text] = Field(max_length=20)


class Cursor(TypedDict):
    index: int
    payload: dict


class Workflow:
    def __init__(self, store: Store, provider: Provider, config: Settings, tracer):
        self.store, self.provider, self.config, self.tracer = (
            store,
            provider,
            config,
            tracer,
        )

    def stage(self, name, state):
        brief = Brief.model_validate(state["brief"])
        complete = self.provider.complete
        if name == "requirements_analyst":
            value, usage = complete(
                "Extract explicit requirements, missing information and assumptions. Assign stable IDs.",
                {"brief": brief.model_dump()},
                Analysis,
                lambda: demo.analyze(brief),
            )
            return {"analysis": value.model_dump()}, usage
        analysis = Analysis.model_validate(state["analysis"])
        if name == "system_architect":
            sources = retrieve(self.store, brief.text)
            value, usage = complete(
                "Design the requested style. Use one gateway, a reachable DAG, renderable x/y coordinates, meaningful API and table specifications. Link requirement IDs only where addressed. Justify choices using the supplied reference passages.",
                {
                    "brief": brief.model_dump(),
                    "analysis": analysis.model_dump(),
                    "references": [x.model_dump() for x in sources],
                },
                Architecture,
                lambda: demo.generate(brief, analysis),
            )
            if value.style != brief.style or coverage(value, analysis)["unknown"]:
                raise ProviderError(
                    "Architecture style or requirement links failed review", True, usage
                )
            return {"architecture": value.model_dump()}, usage
        arch = Architecture.model_validate(state["architecture"])
        if name in TOPICS:
            topic = TOPICS[name]
            sources = retrieve(self.store, topic + " " + brief.text, topic)
            if not sources:
                raise ValueError("No reference passages are indexed for this review")
            advice, usage = complete(
                f"Act as the {name} reviewer. Make one specific recommendation. Use an exact excerpt of at least 12 characters from one supplied passage and its evidence_id. Separate a model observation from proposed action.",
                {
                    "architecture": arch.model_dump(),
                    "inspection": inspect(arch).model_dump(),
                    "sources": [s.model_dump() for s in sources],
                },
                Advice,
                lambda: specialist(topic, arch, sources[0]),
            )
            try:
                citation = grounding(advice, arch, sources)
            except ValueError as exc:
                raise ProviderError(str(exc), True, usage) from None
            finding = {
                "agent": name,
                **advice.model_dump(),
                "citation": citation.model_dump(),
            }
            return {"findings": [*state["findings"], finding]}, usage
        mapping = coverage(arch, analysis)
        questions = [
            f"Validate {r.id} with an acceptance test: {r.text}"
            for r in analysis.requirements
            if r.id in mapping["unmapped"]
        ]
        review, usage = complete(
            "Review this architecture and its cited findings. Identify unresolved requirements and acceptance checks for the human reviewer. Avoid claims of compliance or verified capacity.",
            {
                "analysis": analysis.model_dump(),
                "architecture": arch.model_dump(),
                "coverage": mapping,
                "findings": state["findings"],
            },
            Review,
            lambda: Review(
                summary=f"{len(mapping['mapped'])} of {len(analysis.requirements)} requirements have component links. Review the single-replica dependencies and test assumed service times.",
                follow_up=(questions + analysis.missing)[:20],
            ),
        )
        return {"review": review.model_dump(), "coverage": mapping}, usage

    def execute(self, key):
        initial = self.store.read(key)
        if initial["status"] in ("awaiting_approval", "approved"):
            return initial
        lease = self.store.claim(key)
        initial = self.store.read(key)
        index = initial["step"]
        state = initial["state"]
        state.pop("error", None)
        graph = StateGraph(Cursor)

        def build_node(i):
            def node(cursor):
                data = dict(cursor["payload"])
                name = STAGES[i]
                for attempt in (1, 2):
                    started = perf_counter()
                    error = None
                    with self.tracer.start_as_current_span(name) as span:
                        span.set_attribute("futurestack.run_id", key)
                        span.set_attribute("langfuse.observation.type", "agent")
                        try:
                            patch, usage = self.stage(name, data)
                        except (ProviderError, ValueError) as exc:
                            error = exc
                            usage = getattr(exc, "usage", (None, None))
                        trace = {
                            "stage": name,
                            "provider": self.config.provider,
                            "model": self.config.model or self.config.provider,
                            "attempt": attempt,
                            "ok": error is None,
                            "latency_ms": round((perf_counter() - started) * 1000, 2),
                            "input_tokens": usage[0],
                            "output_tokens": usage[1],
                            "cost_usd": cost(self.config, usage),
                        }
                        for k, v in trace.items():
                            if v is not None:
                                span.set_attribute("futurestack." + k, v)
                    data["traces"] = [*data["traces"], trace]
                    log("agent_stage", run=key, **trace)
                    if error is None:
                        data.update(patch)
                        status = (
                            "awaiting_approval" if i == len(STAGES) - 1 else "running"
                        )
                        self.store.checkpoint(key, lease, i + 1, data, status)
                        return {"index": i + 1, "payload": data}
                    if attempt == 2 or not getattr(error, "retryable", False):
                        data["error"] = str(error)[:300]
                        self.store.checkpoint(key, lease, i, data, "failed")
                        raise ProviderError(data["error"])
                    self.store.checkpoint(key, lease, i, data, "running")
                    sleep(0.15)
                raise RuntimeError("Attempt budget exhausted")

            return node

        for i in range(index, len(STAGES)):
            graph.add_node(STAGES[i], build_node(i))
            graph.add_edge(START if i == index else STAGES[i - 1], STAGES[i])
        graph.add_edge(STAGES[-1], END)
        with self.tracer.start_as_current_span("architecture.review"):
            try:
                graph.compile().invoke(
                    {"index": index, "payload": state}, {"recursion_limit": 9}
                )
            except ProviderError:
                pass  # The failed stage and attempts are already durable and returned to the caller.
        return self.store.read(key)
