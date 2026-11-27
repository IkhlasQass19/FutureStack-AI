# Reading a time-machine experiment

A scenario is a short, repeatable load experiment against one architecture. Each month starts a new SimPy environment with empty queues. There is no month-to-month state, empirical growth model, random seed, or training data behind the timeline. The month labels encode stress intensity.

Let h = month / 24, with month in {0, 6, 12, 24}. Default inputs are 24 requests/s and 12 seconds of arrivals.

| Scenario | Input change |
| --- | --- |
| Baseline | Fixed arrival rate and 2 ms per directed edge. |
| Traffic growth | Offered rate = base rate × (1 + 2h). |
| Network latency | Transit time = 2 + 100h ms per directed edge. |
| Database failure | The chosen database fails work overlapping a window beginning one-third into the experiment and lasting h × duration / 2. |
| Service outage | Applies the same outage to the chosen service. |
| Budget cap | Interpolate from the original spend to the chosen month-24 budget. Reduce replicas of the highest unit-cost components first, with stable ID tie-breaking. Keep at least one replica per component. Report when the minimum footprint exceeds the cap. |

### Event semantics

An arrival traverses the unique gateway. Components have a shared FIFO queue with 32 waiting places. Replicas × slots defines concurrency. Local service takes a fixed number of milliseconds and releases its slot before making downstream calls. A full queue rejects the incoming visit immediately. Synchronous branches execute serially in target-ID order and propagate errors to the caller. An asynchronous edge starts an independently drained task. Reconverging edges can revisit the same component. The graph validator limits total visits per arrival to 64.

An outage applies to the entire component. A service interval overlapping the outage fails at completion. In-flight work already waiting for a slot is evaluated when service begins. The model drains all foreground and background work after arrivals stop.

### Interpret metrics together

- **Success percentage** counts completed foreground responses divided by all offered requests. **p95** uses the nearest-rank successful-request latency. Failed responses are absent from this distribution. A missing p95 means there were zero successful responses.
- **Mean wait** sums FIFO waiting time over all attempted component visits, including rejected attempts with zero wait. The highest mean wait among components that queued work is the reported bottleneck.
- **Failure paths** count the paths on which a visit actually failed. The diagram highlights the observed paths at the selected horizon. An asynchronous consumer failure can be visible while the foreground request succeeds.
- **Single points** are required, synchronously reachable components with one effective replica under the model. Independent failure domains, failover timing and correlated infrastructure faults require additional modeling.
- **Monthly spend** sums explicit per-replica price assumptions. The budget strategy is a deterministic heuristic. It does not optimize latency subject to a real cloud bill.

### What would change the result

Arrival bursts, service-time distributions, cache hits, read/write routing, concurrent fan-out, retries, deadlines, autoscaling, connection pools, replication protocols and infrastructure topology can change outcomes substantially. The event-driven template models delivery separation; it omits broker persistence and redelivery. Replace assumptions with observed distributions and validate against load-test traces before making capacity decisions.
