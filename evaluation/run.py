"""Paired, non-LLM rubric. Run from the repository root with python -m evaluation.run."""

import argparse
import json
import re
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter
from pydantic import Field
from futurestack.config import Settings
from futurestack.demo import analyze, generate
from futurestack.evidence import ingest, retrieve
from futurestack.models import Architecture, Brief, Contract
from futurestack.providers import Provider, cost
from futurestack.skills import Advice, grounding, inspect
from futurestack.storage import Store
from futurestack.telemetry import telemetry
from futurestack.workflow import Workflow


class Proposal(Contract):
    architecture: Architecture
    advice: list[Advice] = Field(max_length=5)


def score(case, arch, advice, sources):
    content = json.dumps(
        {
            "api": [e.model_dump() for e in arch.endpoints],
            "tables": [t.model_dump() for t in arch.tables],
            "components": [
                [c.name, c.rationale, c.technology] for c in arch.components
            ],
        }
    ).lower()
    hits = [
        any(term in content for term in alternatives)
        for alternatives in case["capabilities"]
    ]
    checks = [
        arch.style == case["style"],
        all(k in {c.kind for c in arch.components} for k in case["kinds"]),
        bool(arch.endpoints),
        bool(arch.tables),
        arch.style != "event-driven" or any(e.mode == "async" for e in arch.edges),
    ]
    checks.append(
        arch.style != "microservices"
        or sum(c.kind == "service" for c in arch.components) >= 2
    )
    unsupported = 0
    facts = (
        json.dumps(
            [
                arch.model_dump(),
                inspect(arch).model_dump(),
                [c.monthly_usd * c.replicas for c in arch.components],
            ]
        )
        + " "
        + " ".join(s.passage for s in sources)
    )
    numbers = lambda s: {float(v) for v in re.findall(r"(?<!\w)\d+(?:\.\d+)?", s)}
    for a in advice:
        try:
            grounding(a, arch, sources)
        except ValueError:
            unsupported += 1
            continue
        if numbers(a.observation + " " + a.recommendation) - numbers(facts):
            unsupported += 1
    return {
        "capability_hits": hits,
        "coverage": round(sum(hits) / len(hits), 3),
        "consistency": round(sum(checks) / len(checks), 3),
        "advice_count": len(advice),
        "flagged_unsupported": unsupported,
        "unsupported_rate": round(unsupported / len(advice), 3) if advice else None,
    }


def total(traces, key):
    values = [s[key] for s in traces]
    return sum(values) if all(v is not None for v in values) else None


def evaluate(cases, cfg):
    out = []
    with TemporaryDirectory() as tmp:
        store = Store("sqlite:///" + tmp + "/evaluation.db")
        store.setup_demo()
        ingest(store)
        provider = Provider(cfg)
        spans = telemetry(cfg)
        flow = Workflow(store, provider, cfg, spans.get_tracer("futurestack.eval"))
        for case in cases:
            brief = Brief(text=case["text"], style=case["style"])
            sources = retrieve(store, brief.text, k=4)
            for mode in ("single-call", "reviewed"):
                start = perf_counter()
                record = {
                    "id": case["id"],
                    "mode": mode,
                    "provider": cfg.provider,
                    "model": cfg.model or "rule-based demo",
                }
                try:
                    if mode == "single-call":
                        proposal, usage = provider.complete(
                            "Design the requested architecture with exactly one reachable gateway. Include evidence-grounded recommendations with exact supporting passages.",
                            {
                                "brief": brief.model_dump(),
                                "evidence": [s.model_dump() for s in sources],
                            },
                            Proposal,
                            lambda: Proposal(
                                architecture=generate(brief, analyze(brief)), advice=[]
                            ),
                        )
                        arch, advice = proposal.architecture, proposal.advice
                        traces = [
                            {
                                "input_tokens": usage[0],
                                "output_tokens": usage[1],
                                "cost_usd": cost(cfg, usage),
                            }
                        ]
                    else:
                        state = flow.execute(store.create(brief)["id"])
                        if state["status"] != "awaiting_approval":
                            raise ValueError(
                                state["state"].get("error", "Review failed")
                            )
                        arch = Architecture.model_validate(
                            state["state"]["architecture"]
                        )
                        advice = [
                            Advice.model_validate(
                                {k: f[k] for k in Advice.model_fields}
                            )
                            for f in state["state"]["findings"]
                        ]
                        traces = state["state"]["traces"]
                    record.update(score(case, arch, advice, sources))
                    record.update(
                        {
                            key: total(traces, key)
                            for key in ("input_tokens", "output_tokens", "cost_usd")
                        },
                        status="ok",
                    )
                except Exception as exc:
                    record.update(
                        status="error",
                        error=type(exc).__name__,
                        input_tokens=None,
                        output_tokens=None,
                        cost_usd=None,
                    )
                record["latency_ms"] = round((perf_counter() - start) * 1000, 2)
                out.append(record)
        spans.shutdown()
        store.engine.dispose()
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cases", type=Path, default=Path(__file__).with_name("cases.json"))
    p.add_argument("--output", type=Path, default=Path("results.json"))
    args = p.parse_args()
    rows = evaluate(json.loads(args.cases.read_text()), Settings())
    args.output.write_text(json.dumps(rows, indent=2) + "\n")
    print(f"{len(rows)} paired-mode observations written to {args.output}")
    if any(r["status"] != "ok" for r in rows):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
