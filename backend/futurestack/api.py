from contextlib import asynccontextmanager
from hmac import compare_digest
from typing import Annotated
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import Field
from sqlalchemy import text
from . import demo, responses
from .config import Settings
from .evidence import Citation, ingest, retrieve
from .models import Architecture, Brief, Contract, Scenario, SimulationInput
from .providers import Provider
from .simulation import Result, simulate, timeline
from .skills import Inspection, coverage, diff, inspect
from .storage import Conflict, Store
from .telemetry import telemetry
from .workflow import Workflow


class Revision(Contract):
    base: int = Field(ge=1)
    architecture: Architecture


class Comparison(Contract):
    left: int = Field(ge=1)
    right: int = Field(ge=1)
    right_run: str | None = Field(default=None, max_length=36)
    scenario: Scenario


def create_app(config=None, store=None, provider=None):
    cfg = config or Settings()
    db = store or Store(cfg.database_url)
    spans = telemetry(cfg)
    flow = Workflow(db, provider or Provider(cfg), cfg, spans.get_tracer("futurestack"))

    @asynccontextmanager
    async def lifespan(app):
        db.setup_demo()
        ingest(db)
        yield
        spans.shutdown()
        db.engine.dispose()

    app = FastAPI(
        title="FutureStack AI",
        version="0.1.0",
        lifespan=lifespan,
        description="Single-workspace architecture experiments. Results are hypothetical. Use a trusted identity proxy for shared deployments.",
    )

    bearer = HTTPBearer(
        auto_error=False, description="Workspace token configured on the server"
    )

    def authorize(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        supplied = credentials.credentials if credentials else ""
        if cfg.workspace_token and not compare_digest(
            supplied.encode(), cfg.workspace_token.get_secret_value().encode()
        ):
            raise HTTPException(
                401,
                "Valid workspace token required",
                headers={"WWW-Authenticate": "Bearer"},
            )

    router = APIRouter(prefix="/v1", dependencies=[Depends(authorize)])

    @app.exception_handler(Conflict)
    async def conflict(_, exc):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(KeyError)
    async def missing(_, exc):
        return JSONResponse({"detail": exc.args[0]}, status_code=404)

    @app.exception_handler(ValueError)
    async def invalid(_, exc):
        return JSONResponse({"detail": str(exc)[:800]}, status_code=422)

    @app.get("/health")
    def health():
        with db.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}

    @router.get("/config")
    def public_config():
        return {"provider": cfg.provider, "model": cfg.model or "rule-based demo"}

    @router.post("/preview", response_model=responses.Preview)
    def preview(brief: Brief):
        """Always use the offline generator. Durable runs use the configured provider."""
        analysis = demo.analyze(brief)
        return {"analysis": analysis, "architecture": demo.generate(brief, analysis)}

    @router.post("/runs", status_code=201, response_model=responses.Run)
    def create(brief: Brief):
        return db.create(brief)

    @router.get("/runs", response_model=list[responses.Summary])
    def recent():
        return db.recent()

    @router.get("/runs/{key}", response_model=responses.Run)
    def run(key: str):
        return db.read(key)

    @router.post("/runs/{key}/execute", response_model=responses.Run)
    def execute(key: str):
        return flow.execute(key)

    @router.post("/runs/{key}/approve", response_model=responses.Snapshot)
    def approve(key: str):
        state = db.read(key)
        if state["status"] == "approved":
            return {"number": 1}
        if state["status"] != "awaiting_approval":
            raise Conflict("Complete the architecture review before approval")
        arch = Architecture.model_validate(state["state"]["architecture"])
        return {"number": db.save(key, 0, arch)}

    @router.get("/runs/{key}/versions/{number}", response_model=Architecture)
    def version(key: str, number: int):
        return db.version(key, number)

    @router.post(
        "/runs/{key}/versions", status_code=201, response_model=responses.Snapshot
    )
    def save(key: str, body: Revision):
        from .models import Analysis

        state = db.read(key)
        if state["status"] != "approved":
            raise Conflict("Approve the initial architecture first")
        if coverage(
            body.architecture, Analysis.model_validate(state["state"]["analysis"])
        )["unknown"]:
            raise ValueError("Unknown requirement reference")
        return {"number": db.save(key, body.base, body.architecture)}

    @router.post("/runs/{key}/compare", response_model=responses.CompareResult)
    def compare(key: str, body: Comparison):
        a, b = db.version(key, body.left), db.version(body.right_run or key, body.right)
        return {
            "diff": diff(a, b),
            "left": timeline(a, body.scenario),
            "right": timeline(b, body.scenario),
        }

    @router.post("/inspect", response_model=Inspection)
    def inspection(architecture: Architecture):
        return inspect(architecture)

    @router.post("/simulate", response_model=Result)
    def experiment(payload: SimulationInput):
        return simulate(payload.architecture, payload.scenario)

    @router.post("/timeline", response_model=list[responses.Point])
    def horizons(payload: SimulationInput):
        return timeline(payload.architecture, payload.scenario)

    @router.get("/evidence", response_model=list[Citation])
    def evidence(q: Annotated[str, Query(min_length=2, max_length=500)]):
        return retrieve(db, q)

    @router.post(
        "/runs/{key}/versions/{number}/report", response_class=PlainTextResponse
    )
    def report(key: str, number: int, scenario: Scenario):
        arch = db.version(key, number)
        data = db.read(key)["state"]
        result = simulate(arch, scenario)
        lines = [
            f"# {arch.name} · revision {number}",
            "",
            "Hypothetical engineering experiment. Inputs require calibration before operational use.",
            "",
            "## Business brief",
            data["brief"]["text"],
            "",
            "## Scenario",
            scenario.model_dump_json(indent=2),
            "",
            "## Simulated outcome",
            f"{result.succeeded}/{result.requests} successful requests. Successful-request p95: {result.p95_ms} ms. Assumed infrastructure: ${result.monthly_usd}/month.",
            "",
            "## Components",
            *[
                f"- {c.name} ({c.technology}, {c.replicas} replicas). {c.rationale}"
                for c in arch.components
            ],
            "",
            "## Initial design review (revision 1)",
            *[
                f"- {f['observation']} {f['recommendation']} [{f['citation']['title']}]({f['citation']['url']})"
                for f in data["findings"]
            ],
            "",
            "## Unresolved questions",
            *["- " + q for q in data["review"]["follow_up"]],
            "",
            "## Simulation assumptions",
            *["- " + s for s in result.assumptions],
            "",
            "## Reproducible inputs and outputs",
            "\x60\x60\x60json",
            arch.model_dump_json(indent=2),
            "\x60\x60\x60",
            "\x60\x60\x60json",
            result.model_dump_json(indent=2),
            "\x60\x60\x60",
        ]
        return PlainTextResponse(
            "\n".join(lines),
            media_type="text/markdown",
            headers={
                "Content-Disposition": f'attachment; filename="futurestack-v{number}.md"'
            },
        )

    app.include_router(router)
    return app


app = create_app()
