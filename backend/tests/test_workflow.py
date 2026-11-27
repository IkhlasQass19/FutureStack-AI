from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from futurestack.api import create_app
from futurestack.config import Settings
from futurestack.evidence import ingest, retrieve
from futurestack.providers import Provider, ProviderError
from futurestack.storage import Store, Conflict


def settings(tmp_path):
    return Settings(
        _env_file=None,
        database_url="sqlite:///" + str(tmp_path / "test.db"),
        provider="demo",
    )


def run_review(client):
    key = client.post(
        "/v1/runs",
        json={"text": "Sell tickets to live concerts. Keep p95 below 200 ms."},
    ).json()["id"]
    return key, client.post(f"/v1/runs/{key}/execute").json()


def test_lifecycle(tmp_path):
    cfg = settings(tmp_path)
    with TestClient(create_app(cfg)) as c:
        key, r = run_review(c)
        assert r["status"] == "awaiting_approval" and len(r["state"]["traces"]) == 6
        assert len(r["state"]["findings"]) == 3
        assert all(
            f["support"] in f["citation"]["passage"] for f in r["state"]["findings"]
        )
    with TestClient(create_app(cfg)) as c:
        prefix = f"/v1/runs/{key}"
        assert c.post(prefix + "/approve").json() == {"number": 1}
        a = c.get(prefix + "/versions/1").json()
        next(n for n in a["components"] if n["id"] == "store")["replicas"] = 3
        assert (
            c.post(
                prefix + "/versions", json={"base": 1, "architecture": a}
            ).status_code
            == 201
        )
        assert (
            c.post(
                prefix + "/versions", json={"base": 1, "architecture": a}
            ).status_code
            == 409
        )
        pair = c.post(
            prefix + "/compare",
            json={"left": 1, "right": 2, "scenario": {"kind": "traffic-growth"}},
        ).json()
        assert (
            pair["left"][-1]["result"]["success_pct"]
            < pair["right"][-1]["result"]["success_pct"]
        )
        assert "store" in pair["diff"]["modified"]
        report = c.post(prefix + "/versions/2/report", json={})
        assert (
            "Hypothetical" in report.text
            and "attachment" in report.headers["content-disposition"]
        )


def test_resume_at_failed_stage(tmp_path):
    cfg = settings(tmp_path)

    class Flaky(Provider):
        fails = 0

        def complete(self, instruction, *args):
            if instruction.startswith("Design") and self.fails < 2:
                self.fails += 1
                raise ProviderError("Transient contract failure", True)
            return super().complete(instruction, *args)

    with TestClient(create_app(cfg, provider=Flaky(cfg))) as c:
        key, r = run_review(c)
        assert (r["status"], r["step"]) == ("failed", 1)
    with TestClient(create_app(cfg)) as c:
        r = c.post(f"/v1/runs/{key}/execute").json()
        assert r["status"] == "awaiting_approval" and len(r["state"]["traces"]) == 8


def test_authorization_and_input_limits(tmp_path):
    cfg = settings(tmp_path).model_copy(update={})
    from pydantic import SecretStr

    cfg.workspace_token = SecretStr("local-test")
    with TestClient(create_app(cfg)) as c:
        assert c.get("/v1/runs").status_code == 401
        h = {"Authorization": "Bearer local-test"}
        assert c.get("/v1/runs", headers=h).status_code == 200
        assert c.post("/v1/runs", headers=h, json={"text": "short"}).status_code == 422


def test_same_base_race(tmp_path):
    cfg = settings(tmp_path)
    db = Store(cfg.database_url)
    with TestClient(create_app(cfg, store=db)) as c:
        key, _ = run_review(c)
        c.post(f"/v1/runs/{key}/approve")
        a = db.version(key, 1)

        def save(_):
            try:
                return db.save(key, 1, a)
            except Conflict:
                return "stale"

        with ThreadPoolExecutor(2) as pool:
            assert set(pool.map(save, range(2))) == {2, "stale"}


def test_retrieval(tmp_path):
    db = Store(settings(tmp_path).database_url)
    db.setup_demo()
    ingest(db)
    ingest(db)
    got = retrieve(db, "row security table privileges policies")
    assert got[0].id.startswith("security-") and len({x.id for x in got}) == 3
