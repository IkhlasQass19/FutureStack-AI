from types import SimpleNamespace
from unittest.mock import Mock
import httpx
import pytest
from pydantic import SecretStr
from futurestack.config import Settings
from futurestack.demo import analyze
from futurestack.models import Analysis, Brief
from futurestack.providers import Provider, ProviderError, cost
from futurestack.skills import Advice, grounding
from evaluation.run import score


def config(**kwargs):
    return Settings(_env_file=None, **kwargs)


def test_compatible_schema_and_usage(monkeypatch):
    cfg = config(
        provider="compatible",
        model="test-model",
        model_key=SecretStr("fixture-key"),
        input_usd_per_million=1,
        output_usd_per_million=2,
    )
    value = analyze(Brief(text="Process customer orders."))
    response = httpx.Response(
        200,
        request=httpx.Request("POST", "https://example.invalid"),
        json={
            "choices": [{"message": {"content": value.model_dump_json()}}],
            "usage": {"prompt_tokens": 80, "completion_tokens": 20},
        },
    )
    mock = Mock(return_value=response)
    monkeypatch.setattr(httpx, "post", mock)
    got, usage = Provider(cfg).complete("Analyze", {}, Analysis, lambda: None)
    assert got == value and usage == (80, 20) and cost(cfg, usage) == 0.00012
    assert mock.call_args.kwargs["headers"]["Authorization"] == "Bearer fixture-key"


def test_schema_failure_is_retryable_and_counted(monkeypatch):
    cfg = config(provider="compatible", model="local")
    response = httpx.Response(
        200,
        request=httpx.Request("POST", "http://localhost"),
        json={
            "choices": [{"message": {"content": "invalid JSON"}}],
            "usage": {"prompt_tokens": 2, "completion_tokens": 3},
        },
    )
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: response)
    with pytest.raises(ProviderError) as err:
        Provider(cfg).complete("Analyze", {}, Analysis, lambda: None)
    assert err.value.retryable and err.value.usage == (2, 3)
    assert cost(cfg, (2, 3)) is None


def test_oci_generic_sdk_contract():
    pytest.importorskip("oci")
    cfg = config(
        provider="oci", model="fixture-model", compartment="fixture-compartment"
    )
    adapter = Provider(cfg)
    value = analyze(Brief(text="Process patient appointments."))
    reply = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content=[SimpleNamespace(text=value.model_dump_json())]
                )
            )
        ],
        usage=SimpleNamespace(prompt_tokens=34, completion_tokens=19),
    )
    adapter._oci = Mock()
    adapter._oci.chat.return_value = SimpleNamespace(
        data=SimpleNamespace(chat_response=reply)
    )
    got, counts = adapter.complete("Analyze", {}, Analysis, lambda: None)
    assert got == value and counts == (34, 19)
    details = adapter._oci.chat.call_args.args[0]
    assert (
        details.serving_mode.model_id == cfg.model
        and details.chat_request.api_format == "GENERIC"
    )


def test_citation_mismatch_and_unsupported_metric():
    from futurestack.demo import generate
    from futurestack.evidence import Citation

    b = Brief(text="Process customer orders.")
    a = generate(b, analyze(b))
    source = Citation(
        id="s1",
        title="Capacity",
        url="https://example.org",
        passage="Bound the number of pending requests.",
    )
    f = Advice(
        component="api",
        observation="Capacity is 987654 requests per second.",
        recommendation="Perform load tests.",
        support=source.passage,
        evidence_id="s1",
    )
    result = score(
        {"style": "microservices", "capabilities": [["order"]], "kinds": ["service"]},
        a,
        [f],
        [source],
    )
    assert result["flagged_unsupported"] == 1
    f.evidence_id = "invented"
    with pytest.raises(ValueError):
        grounding(f, a, [source])


def test_exporter_does_not_include_prompt(monkeypatch):
    from futurestack.telemetry import telemetry
    from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
        ExportTraceServiceRequest,
    )
    import requests

    sent = []

    def send(self, request, **kwargs):
        msg = ExportTraceServiceRequest.FromString(request.body)
        sent.append(
            (request.url, {k.lower(): v for k, v in request.headers.items()}, msg)
        )
        response = requests.Response()
        response.status_code = 200
        response._content = b""
        return response

    monkeypatch.setattr(requests.Session, "send", send)
    cfg = config(
        langfuse_url="https://example.invalid",
        langfuse_public="fixture",
        langfuse_secret=SecretStr("test-only"),
    )
    provider = telemetry(cfg)
    with provider.get_tracer("test").start_as_current_span("cost_optimisation") as span:
        span.set_attribute("futurestack.run_id", "abc")
    assert provider.force_flush()
    provider.shutdown()
    assert sent[0][0].endswith("/api/public/otel/v1/traces") and sent[0][1][
        "authorization"
    ].startswith("Basic ")
    assert (
        sent[0][2].resource_spans[0].scope_spans[0].spans[0].name == "cost_optimisation"
    )
