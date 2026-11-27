import type { Architecture, Style } from "../app/types";
export type Trace = {
  stage: string;
  model: string;
  provider: string;
  attempt: number;
  ok: boolean;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
};
export type Run = {
  id: string;
  status: string;
  step: number;
  head: number;
  state: {
    brief: { text: string; style: Style };
    architecture?: Architecture;
    error?: string;
    analysis?: {
      requirements: { id: string; text: string; category: string }[];
      missing: string[];
      assumptions: string[];
    };
    review?: { summary: string; follow_up: string[] };
    findings: {
      agent: string;
      observation: string;
      recommendation: string;
      support: string;
      citation: { id: string; url: string; title: string };
    }[];
    traces: Trace[];
  };
};
export function Review({ run }: { run?: Run }) {
  if (!run)
    return (
      <section className="sheet">
        <h2>Design review</h2>
        <p className="empty">
          Generate a design from a brief to review requirements, evidence and
          agent traces.
        </p>
      </section>
    );
  const s = run.state;
  return (
    <div className="review">
      <section className="sheet">
        <p className="eyebrow">Initial design review</p>
        <h2>Requirements and assumptions</h2>
        <p>{s.review?.summary ?? "Review in progress."}</p>
        <ul>
          {s.analysis?.requirements.map((r) => (
            <li key={r.id}>
              <b>{r.id.toUpperCase()}</b> · {r.text}{" "}
              <small>({r.category})</small>
            </li>
          ))}
        </ul>
        <details open>
          <summary>Missing information and follow-up</summary>
          <ul>
            {(s.review?.follow_up ?? s.analysis?.missing)?.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </details>
        <details>
          <summary>Assumptions</summary>
          <ul>
            {s.analysis?.assumptions.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      </section>
      <section className="sheet">
        <h2>Engineering findings</h2>
        {s.findings.map((f) => (
          <article key={f.agent}>
            <p className="eyebrow">{f.agent.replaceAll("_", " ")}</p>
            <h3>{f.observation}</h3>
            <p>{f.recommendation}</p>
            <details>
              <summary>Inspect evidence</summary>
              <blockquote>{f.support}</blockquote>
              <a href={f.citation.url} target="_blank" rel="noreferrer">
                {f.citation.title} ↗
              </a>
            </details>
          </article>
        ))}
      </section>
      <section className="sheet">
        <h2>Execution trace</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Agent",
                  "Model",
                  "Attempt",
                  "Status",
                  "Time",
                  "Tokens in/out",
                  "Cost USD",
                ].map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.traces.map((t, i) => (
                <tr key={i}>
                  <td>{t.stage.replaceAll("_", " ")}</td>
                  <td>{t.model}</td>
                  <td>{t.attempt}</td>
                  <td>{t.ok ? "Completed" : "Failed"}</td>
                  <td>{t.latency_ms} ms</td>
                  <td>
                    {t.input_tokens ?? "—"}/{t.output_tokens ?? "—"}
                  </td>
                  <td>{t.cost_usd ?? "Unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
