import base64
import json
import logging
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter


def telemetry(config):
    provider = TracerProvider(
        resource=Resource.create({"service.name": "futurestack-api"})
    )
    if config.otlp_traces_url:
        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=config.otlp_traces_url))
        )
    if config.langfuse_url and config.langfuse_public and config.langfuse_secret:
        pair = config.langfuse_public + ":" + config.langfuse_secret.get_secret_value()
        headers = {
            "Authorization": "Basic " + base64.b64encode(pair.encode()).decode(),
            "x-langfuse-ingestion-version": "4",
        }
        provider.add_span_processor(
            BatchSpanProcessor(
                OTLPSpanExporter(
                    endpoint=config.langfuse_url.rstrip("/")
                    + "/api/public/otel/v1/traces",
                    headers=headers,
                )
            )
        )
    return provider


def log(event, **fields):
    logging.getLogger("uvicorn.error").info(
        json.dumps({"event": event, **fields}, separators=(",", ":"))
    )
