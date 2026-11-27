import pytest
from pydantic import ValidationError
from futurestack.demo import analyze, generate
from futurestack.models import Architecture, Brief, Scenario
from futurestack.simulation import simulate


def architecture(style="microservices"):
    brief = Brief(
        text="Sell concert tickets. Keep checkout p95 below 120 ms.", style=style
    )
    return generate(brief, analyze(brief))


@pytest.mark.parametrize("style", ["monolith", "microservices", "event-driven"])
def test_style_contract(style):
    a = architecture(style)
    assert a.entry == "edge" and a.tables and a.endpoints
    assert ("events" in a.graph()) == (style == "event-driven")


@pytest.mark.parametrize(
    "kind", ["traffic-growth", "database-failure", "network-latency"]
)
def test_deterministic_scenarios(kind):
    a = architecture()
    scenario = Scenario(kind=kind, horizon=24)
    result = simulate(a, scenario)
    assert result == simulate(a, scenario)
    assert result.requests == result.succeeded + result.failed
    if kind == "traffic-growth":
        assert result.bottleneck == "store" and result.nodes["store"].peak_queue == 32
    if kind == "database-failure":
        assert result.failed and any(p.endswith("store") for p in result.failure_paths)
    if kind == "network-latency":
        assert result.p95_ms > simulate(a, Scenario(kind="baseline")).p95_ms


def test_invalid_graph():
    a = architecture().model_dump()
    a["edges"].append({"source": "store", "target": "edge"})
    with pytest.raises(ValidationError):
        Architecture.model_validate(a)


def test_brief_missing_and_categories():
    a = analyze(Brief(text="Book appointments. Keep p95 below 100 ms."))
    assert [r.category for r in a.requirements] == ["functional", "non-functional"]
    assert all("p95" not in q for q in a.missing)
