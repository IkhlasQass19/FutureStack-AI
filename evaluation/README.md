# Paired architecture evaluation

Run `python -m evaluation.run --output results.json` from the repository root. Six fixed cases cover familiar domains and a library domain that exercises the generator's generic fallback. Each row stores independent capability labels and expected component kinds. Both modes see the same brief, style, provider and offline source catalog. The single-call prompt receives the four source notes together. The reviewed workflow retrieves evidence by role.

**Single-call** requests an architecture and cited advice in one response. **Reviewed** runs the six-stage graph through its human review boundary. The human does not contribute to the evaluation score. In demo mode both paths use the same deterministic architecture template, and the single-call control emits no advice. An empty advice set has an undefined unsupported rate.

| Measure | Scoring rule |
| --- | --- |
| Requirement coverage | Fraction of manually labeled capability groups with at least one matching term in component names/rationales/technologies, endpoint contracts, or tables. Echoing the original brief in the requirements list earns no credit. |
| Architectural consistency | Mean of checks for requested style, expected kinds, presence of endpoints/tables and style-specific structure. All proposals must also pass graph validation. |
| Unsupported claims | Flag advice with an unknown component, missing citation, nonmatching supporting excerpt, or numeric claim absent from supplied passages or the scenario's static graph facts. |
| Consumption | Provider-reported input and output tokens, elapsed wall time, and cost calculated from configured per-million-token rates. A missing usage field or rate yields null. |

The rubric is a reproducible screening tool. A matching keyword can overstate capability coverage, a real synonym can be missed, and citation integrity alone cannot establish entailment. Human review should independently judge whether recommendations follow from their passages. The six cases are too small to rank providers. Provider errors are explicit observations with a nonzero process exit. A failed call may still be billable.

The checked-in demo run contains 12 observations. Both modes averaged 41.65% on the stored rounded coverage scores and 100% on structural checks. The reviewed path produced 18 findings with zero automated support flags. The baseline produced no advice. No paid calls ran in this benchmark. These results illustrate the limits of the template and rubric. A live-model comparison requires setting `FS_PROVIDER` and a specific model ID, supplying credentials and pricing, then running the same dataset. Model-service outputs and latency may vary between runs.
