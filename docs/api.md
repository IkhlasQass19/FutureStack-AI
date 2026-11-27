# API and tool contracts

The running API serves interactive documentation at `/docs` and its OpenAPI description at `/openapi.json`. A generated snapshot is included for offline inspection. [OpenAPI JSON](openapi.json)

The native development URL is `http://127.0.0.1:8000`. When `FS_WORKSPACE_TOKEN` is configured, send `Authorization: Bearer <workspace-token>` on every `/v1` request. Swagger's **Authorize** button accepts the token. The Next.js proxy supplies it server-side. Health is available at `GET /health`.

| Method and path | Behavior |
| --- | --- |
| GET /v1/config | Public-facing provider and model labels for authorized workspace users. |
| POST /v1/preview | Stateless rules-based analysis and proposal for a brief. |
| POST /v1/runs | Persist a validated brief and return a run ID before model work begins. |
| GET /v1/runs | Up to 50 most recently created runs. |
| GET /v1/runs/{id} | Brief, stage cursor, traces, review state, and current version number. |
| POST /v1/runs/{id}/execute | Execute or resume the six-stage workflow. Inspect the returned status for a recoverable provider failure. |
| POST /v1/runs/{id}/approve | Explicitly approve the reviewed proposal and publish immutable version 1. |
| GET /v1/runs/{id}/versions/{n} | Read an exact architecture version. |
| POST /v1/runs/{id}/versions | Save an edited architecture with the expected current version in `base`. |
| POST /v1/runs/{id}/compare | Return structural differences and matched four-horizon timelines for `left` and `right` revisions. Optional `right_run` selects another workspace design. |
| POST /v1/inspect | Compute static capacity, synchronous single-replica dependencies and assumed spend. |
| POST /v1/simulate | Run one supplied architecture and scenario at one horizon. |
| POST /v1/timeline | Run all four horizons for the same architecture and scenario. |
| GET /v1/evidence?q=... | Return up to three ranked passages with source IDs and URLs. |
| POST /v1/runs/{id}/versions/{n}/report | Download Markdown with the saved architecture, selected scenario, model results, limitations and original review. |

### A full request sequence

This example uses the installed Python libraries and the running local API. Run it from the repository root. It loads the workspace token from the same configuration as the server.

```python
import httpx
from futurestack.config import Settings

cfg = Settings()
headers = {}
if cfg.workspace_token:
    headers["Authorization"] = "Bearer " + cfg.workspace_token.get_secret_value()

with httpx.Client(base_url="http://127.0.0.1:8000/v1/", headers=headers, timeout=600) as client:
    brief = {"text": "Reserve concert tickets. Keep checkout p95 below 200 ms.", "style": "microservices"}
    run = client.post("runs", json=brief).raise_for_status().json()
    path = "runs/" + run["id"]
    review = client.post(path + "/execute").raise_for_status().json()
    print(review["state"]["findings"])
    # In an attended client, obtain the reviewer's decision here.
    assert review["status"] == "awaiting_approval"
    client.post(path + "/approve").raise_for_status()
    arch = client.get(path + "/versions/1").raise_for_status().json()
    output = client.post("simulate", json={
        "architecture": arch,
        "scenario": {"kind": "traffic-growth", "rps": 24, "duration_s": 12, "horizon": 24},
    }).raise_for_status().json()
    print(output["requests"], output["failed"], output["p95_ms"])
```

A 409 indicates a stale revision, an active execution lease, or an incorrect approval state. Fetch the run and compare the latest version before retrying an edit. A 422 describes a contract violation, such as a cycle, a missing target or a database-outage target with the wrong component kind. The model path returns a persisted `failed` status when its bounded attempts are exhausted.

### Local MCP

Install the Python project and launch `futurestack-mcp` from an MCP host using the stdio transport. Select the absolute path to the executable inside the project environment. For example, replace the path in this client configuration with the local installation path.

```json
{
  "mcpServers": {
    "futurestack": {
      "command": "/absolute/path/to/futurestack-ai/.venv/bin/futurestack-mcp"
    }
  }
}
```

`inspect_architecture` takes `{"architecture": ...}` and returns an Inspection. `simulate_architecture` takes `{"experiment": {"architecture": ..., "scenario": ...}}` and returns a Result. The server advertises both input and output JSON schemas. Its two functions call pure graph and simulation code. No filesystem, shell, provider, network, approval, or persistence tool is registered. Use the supplied architecture JSON files as tool inputs.
