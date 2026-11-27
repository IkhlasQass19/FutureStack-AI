"""Public lifecycle and time-machine response contracts."""

from typing import Literal
from .models import Analysis, Architecture, Brief, Contract
from .skills import Advice
from .evidence import Citation
from .simulation import Result
from .workflow import Review


class Trace(Contract):
    stage: str
    provider: str
    model: str
    attempt: int
    ok: bool
    latency_ms: float
    input_tokens: int | None
    output_tokens: int | None
    cost_usd: float | None


class Finding(Advice):
    agent: str
    citation: Citation


class State(Contract):
    brief: Brief
    findings: list[Finding]
    traces: list[Trace]
    analysis: Analysis | None = None
    architecture: Architecture | None = None
    coverage: dict[str, list[str]] | None = None
    review: Review | None = None
    error: str | None = None


class Summary(Contract):
    id: str
    created: float
    status: Literal["ready", "running", "failed", "awaiting_approval", "approved"]
    head: int


class Run(Summary):
    step: int
    state: State


class Point(Contract):
    month: int
    result: Result


class Snapshot(Contract):
    number: int


class Preview(Contract):
    architecture: Architecture
    analysis: Analysis


class CompareResult(Contract):
    diff: dict
    left: list[Point]
    right: list[Point]
