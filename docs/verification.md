# Verification record

Local run on November 27, 2026. Python 3.12, Node 22.23.3 and Next.js 15.5.29. The provider used for end-to-end tests was the credential-free demo.

| Phase | Check | Observed result |
| --- | --- | --- |
| Design | Inspected the supplied project directory and wrote the design, architecture, repository map and phased acceptance criteria before implementation. | The supplied directory was empty. |
| MVP | Domain validation, style generation, three stress scenarios, deterministic replay and queue behavior. | 8 tests passed. |
| Durable workflow | Approval across process lifetime, resume after bounded provider failure, conflict on stale edits and concurrent saves, paired simulations, citations and report export. | 13 cumulative tests passed. |
| Delivery | Unit and integration suite with the local SQLite path. | 25 tests passed. |
| Delivery | Same suite with the migration/retrieval/API integration test targeting an isolated PostgreSQL 16 installation with pgvector. | 25 tests passed. The temporary database shut down after the run. |
| MCP | Actual stdio client initialized the server, listed its two tools, simulated a valid architecture and submitted an out-of-range workload. | Valid result returned and invalid input rejected. Included in the suite. |
| Providers | OCI SDK constructed a real Generic Chat request against a test client. The compatible HTTP adapter parsed a fixture response and recorded usage. | Contract and malformed-output tests passed. Live model inference requires configured credentials or a model endpoint. |
| Observability | Encoded a real OTLP trace, captured the outbound HTTP request at the transport boundary, checked the Langfuse endpoint and authorization header. | Export contract passed. Hosted Langfuse receipt was not exercised. |
| Evidence | Refreshed the four allowlisted public pages into a separate local index. | 79 chunks across four sources. The repository ships curated source notes and the refresh command. |
| Web | Production Next.js build and TypeScript checks, including unused declarations. | Passed. Dependencies installed via the public Yarn npm-compatible registry. |
| Browser | Chrome opened the built dashboard against a real API. It generated and approved a design, changed database capacity, saved version 2, compared timelines, triggered an outage, downloaded a report and reloaded the workspace. | Passed. Four nodes rendered, six stage traces appeared, the observed path was highlighted, and the layout fit a 390 px viewport. |
| Evaluation | Six fixtures × two modes. | All 12 observations completed and were saved in evaluation/demo-results.json. |
| Containers | Validated the resolved Compose configuration and attempted full startup with an isolated project name. | Configuration passed. Image download stopped because the local Docker engine did not trust the registry certificate. The four-container stack was not run locally. |
| Release | Added CI and version-tagged image publishing workflows. | Source delivered locally. Remote GitHub Actions and GHCR publishing require a configured repository and were not executed here. |

During verification, the migration test caught an unspecified foreign-key column type, the evaluation test caught an omitted derived cost, and the browser walkthrough exposed an ambiguous control label. The passing runs include those fixes. The native database and browser checks are independent of the container startup limitation.
