# Deployment and operations

## Local and single-workspace deployments

The native launcher serves Next.js and FastAPI on loopback. It uses SQLite for durable data and in-process vector ranking. Dependencies require a one-time download. Once installed, the default architecture, reviews, simulations and source retrieval work without model credentials or outbound model calls.

Compose adds PostgreSQL 16 and pgvector, runs Alembic before starting the API, and serves the browser app through a same-origin proxy. Use Docker with Compose v2 or later.

```sh
python3 scripts/init_env.py
docker compose up --build -d --wait
docker compose ps
docker compose logs --tail=100 api
```

The initializer exclusively creates a mode-0600 `.env` with generated URL-safe database and workspace secrets. If a file already exists, configure `POSTGRES_PASSWORD` and `FS_WORKSPACE_TOKEN` there. The database has no published port. The API and web ports bind to loopback. Local changes persist in the `database` volume. `docker compose down` stops the stack and preserves that volume.

### Database lifecycle

The first migration creates run snapshots, versioned graphs, and 256-dimensional evidence vectors. Concurrent revision saves use a conditional head update and version insert in one transaction. A leased run accepts checkpoints from the lease holder. Each completed stage renews the five-minute lease. After a process crash, resume the same run after lease expiration. An unacknowledged in-flight model call can be repeated and billed.

For managed PostgreSQL, provision the vector extension and a migration role first. Set `FS_DATABASE_URL` to a SQLAlchemy `postgresql+psycopg://...` connection string using the provider's required TLS settings. Run `alembic upgrade head` in a release job. Give the application role table access and reserve schema changes for the migration role. The convenience Compose stack uses one database identity. Native SQLite bootstraps its own schema on first start. An Alembic-managed SQLite test should start with a fresh file.

Back up the database before deploying schema changes. For Compose, a source-host backup can be taken with `docker compose exec -T db pg_dump -U futurestack -Fc futurestack > backup.dump`. Test restoration to a separate database. Preserve both run state and architecture versions together.

### Model and observability settings

| Variables | Purpose |
| --- | --- |
| FS_PROVIDER, FS_MODEL | Select demo, oci, or compatible and the exact model identifier. |
| FS_MODEL_URL, FS_MODEL_KEY | Compatible API base ending in /v1 and optional secret bearer key. A local model server must expose /chat/completions and support the output budget. |
| FS_COMPARTMENT, FS_OCI_PROFILE | OCI compartment OCID and a named SDK profile. Mount config and signing key read-only at the SDK path for the runtime user. |
| FS_OCI_AUTH, FS_OCI_ENDPOINT | Set instance_principal on appropriately authorized OCI Compute. Set the full regional inference endpoint when required. |
| FS_INPUT_USD_PER_MILLION, FS_OUTPUT_USD_PER_MILLION | Model-specific token rates. A zero is an explicit price. Omitting a rate leaves estimated cost unknown. |
| FS_OTLP_TRACES_URL | Complete OTLP/HTTP trace collector endpoint, including /v1/traces. |
| FS_LANGFUSE_URL, FS_LANGFUSE_PUBLIC, FS_LANGFUSE_SECRET | Langfuse host and project keys. The exporter appends /api/public/otel/v1/traces and authenticates with the supplied keys. |
| FS_WORKSPACE_TOKEN | Shared backend token for the server-to-server hop. Web client code never receives this token. |

The OCI adapter uses the official Python SDK and Generic Chat request format. Inject workload identity or credentials through your deployment secret manager. A host-local provider is reached from within a container using its routable service address. [OCI Generic Chat](https://docs.oracle.com/en-us/iaas/tools/python/latest/api/generative_ai_inference/models/oci.generative_ai_inference.models.GenericChatResponse.html)

Agent attempts emit JSON logs with stage, attempt, duration, model, token usage and estimated cost. The dashboard reads durable stage traces even when external telemetry is off. OTLP spans carry execution metadata. Prompts and source passages stay out of application-generated trace attributes. Send to a trusted collector or Langfuse instance. [Langfuse OTLP ingestion](https://langfuse.com/integrations/native/opentelemetry)

### Refreshing the evidence corpus

```sh
futurestack-ingest --live
# In Compose, use the app's database settings
docker compose exec api futurestack-ingest --live
```

The CLI downloads four fixed HTTPS URLs. It rejects redirects and oversized responses, strips non-content HTML, chunks by 95 words with 15 words of overlap, then computes normalized feature-hashing embeddings. Each source refresh replaces that source's downloaded chunks in a transaction. The offline notes remain available. Saved findings retain the passage and source URL that supported them at review time. Exact cosine ranking suits this small corpus. Semantic embeddings and an approximate index would require an embedding version, a migration and a retrieval benchmark.

### Delivery and public hosting

The verification workflow tests a pgvector service, evaluates both generation modes, builds Next.js, runs a browser walkthrough, and starts Compose. Pushing a version tag to a configured GitHub repository gates publication of two GHCR images on those checks. The release builds Linux images on the GitHub-hosted runner. Set `FS_API_IMAGE` and `FS_WEB_IMAGE` to the release image references on a compatible host.

```sh
docker compose pull
docker compose up -d --no-build --wait
```

Pin image digests for a controlled release. Store secrets outside source control. Configure TLS and an identity-aware reverse proxy in front of the web service, preserving Host as received by the browser. The web proxy represents one trusted workspace. Every authorized workspace member can inspect its designs and may trigger paid inference when a live provider is enabled. Public multi-user hosting requires ownership checks, quotas, request-size limits, rate controls and a capacity review. Long-running model jobs currently occupy request workers. Set proxy timeouts appropriately or move them to a job queue before supporting concurrent external customers.

### Troubleshooting

- **API unavailable in the browser.** Check `/health`, the server-side `FS_API_URL`, and the matching token in the web and API processes.
- **A run failed.** Inspect its stored trace and error. Correct the provider or brief, then resume the run. A different brief needs a new run.
- **Docker image pull reports an unknown certificate authority.** Use the native setup, or configure the Docker engine's approved trust chain for the registry through your normal administration process.
- **Offline score is low for a particular brief.** Inspect the requirements, unmapped IDs, API specs and evidence. The template has limited domain coverage. The benchmark includes a deliberately unfamiliar domain.
