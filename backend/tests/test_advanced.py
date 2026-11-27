import asyncio
import os
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from futurestack.api import create_app
from futurestack.config import Settings
from futurestack.demo import analyze, generate
from futurestack.evidence import passages, retrieve
from futurestack.mcp_server import server
from futurestack.models import Brief, Scenario
from futurestack.simulation import simulate
from futurestack.storage import Store
from evaluation.run import evaluate


def sample():
    b = Brief(text="Process telemetry from sensors.", style="event-driven")
    return generate(b, analyze(b))


def test_async_and_budget():
    a = sample()
    worker = next(n for n in a.components if n.kind == "worker")
    worker.service_ms = 5000
    r = simulate(a, Scenario(kind="baseline", rps=20))
    assert r.background_failed > 0 and r.failed == 0 and "worker" not in r.single_points
    r = simulate(a, Scenario(kind="budget-cap", horizon=24, budget_usd=1))
    assert r.nodes["api"].effective_replicas == 1 and not r.budget_met


def test_target_validation():
    a = sample()
    with pytest.raises(ValueError):
        simulate(a, Scenario(kind="service-outage", target="store"))
    r = simulate(a, Scenario(kind="service-outage", target="api", horizon=24))
    assert r.failed > 0 and r.nodes["api"].local_failures == r.failed


def test_mcp_contracts():
    async def check():
        tools = await server.list_tools()
        assert {t.name for t in tools} == {
            "inspect_architecture",
            "simulate_architecture",
        }
        assert all(t.annotations.readOnlyHint and t.outputSchema for t in tools)
        response = await server.call_tool(
            "inspect_architecture", {"architecture": sample().model_dump()}
        )
        assert "capacity_rps" in str(response)

    asyncio.run(check())


def test_migration_and_pgvector(tmp_path):
    url = os.environ.get(
        "FS_TEST_POSTGRES", "sqlite:///" + str(tmp_path / "migrated.db")
    )
    cfg = Config("alembic.ini")
    cfg.attributes["database_url"] = url
    command.upgrade(cfg, "head")
    settings = Settings(_env_file=None, database_url=url, provider="demo")
    db = Store(url)
    with TestClient(create_app(settings, db)) as c:
        assert c.get("/health").status_code == 200
        assert retrieve(db, "row security policies", k=1)[0].id.startswith("security")
        k = c.post("/v1/runs", json={"text": "Process customer shop orders."}).json()[
            "id"
        ]
        assert c.post(f"/v1/runs/{k}/execute").json()["status"] == "awaiting_approval"
        assert c.post(f"/v1/runs/{k}/approve").status_code == 200
        assert c.get(f"/v1/runs/{k}/versions/1").json()["style"] == "microservices"


def test_chunk_overlap():
    text = " ".join(map(str, range(120)))
    pieces = list(passages(text, 60, 10))
    assert pieces[0].split()[-10:] == pieces[1].split()[:10]


def test_evaluation_modes():
    case = {
        "id": "smoke",
        "text": "Take shop orders.",
        "style": "monolith",
        "capabilities": [["order"], ["unicorn"]],
        "kinds": ["gateway", "database"],
    }
    rows = evaluate([case], Settings(_env_file=None, provider="demo"))
    assert [r["mode"] for r in rows] == ["single-call", "reviewed"]
    assert rows[0]["coverage"] == 0.5 and rows[0]["unsupported_rate"] is None
    assert rows[1]["advice_count"] == 3 and rows[1]["flagged_unsupported"] == 0


def test_stdio_host_can_inspect_and_simulate():
    import sys
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    async def run():
        command = StdioServerParameters(
            command=sys.executable, args=["-m", "futurestack.mcp_server"]
        )
        async with stdio_client(command) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                assert len((await session.list_tools()).tools) == 2
                payload = {
                    "experiment": {
                        "architecture": sample().model_dump(),
                        "scenario": {"kind": "baseline"},
                    }
                }
                result = await session.call_tool("simulate_architecture", payload)
                assert (
                    not result.isError and result.structuredContent["requests"] == 288
                )
                payload["experiment"]["scenario"]["rps"] = 100000
                invalid = await session.call_tool("simulate_architecture", payload)
                assert invalid.isError

    asyncio.run(run())
