"use client";
import { Activity, Clock3, GitCompareArrows, Play } from "lucide-react";
import type { Architecture, Result, Scenario } from "../app/types";

export type Point = { month: number; result: Result };
export const defaultScenario: Scenario = {
  kind: "traffic-growth",
  rps: 24,
  duration_s: 12,
  horizon: 12,
  budget_usd: 200,
};
export const scenarioNames: Record<string, string> = {
  "traffic-growth": "Traffic growth",
  "database-failure": "Database failure",
  "service-outage": "Service outage",
  "network-latency": "Network latency",
  "budget-cap": "Budget constraint",
  baseline: "Baseline",
};
export function ScenarioForm({
  scenario,
  change,
  arch,
  run,
  busy,
}: {
  scenario: Scenario;
  change: (s: Scenario) => void;
  arch: Architecture;
  run: () => void;
  busy: boolean;
}) {
  const s = scenario;
  return (
    <section className="sheet controls">
      <div className="section-title">
        <Activity size={18} />
        <h2>Scenario controls</h2>
      </div>
      <label>
        Experiment
        <select
          aria-label="Experiment"
          value={s.kind}
          onChange={(e) =>
            change({ ...s, kind: e.target.value, target: undefined })
          }
        >
          {Object.entries(scenarioNames).map(([v, n]) => (
            <option value={v} key={v}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="two">
        <label>
          Base load · req/s
          <input
            type="number"
            min="1"
            max="60"
            value={s.rps}
            onChange={(e) => change({ ...s, rps: Number(e.target.value) })}
          />
        </label>
        <label>
          Duration · sec
          <input
            type="number"
            min="3"
            max="25"
            value={s.duration_s}
            onChange={(e) =>
              change({ ...s, duration_s: Number(e.target.value) })
            }
          />
        </label>
      </div>
      {s.kind === "budget-cap" && (
        <label>
          Month 24 budget · USD
          <input
            type="number"
            min="1"
            value={s.budget_usd}
            onChange={(e) =>
              change({ ...s, budget_usd: Number(e.target.value) })
            }
          />
        </label>
      )}
      {["database-failure", "service-outage"].includes(s.kind) && (
        <label>
          Outage target
          <select
            value={s.target ?? ""}
            onChange={(e) =>
              change({ ...s, target: e.target.value || undefined })
            }
          >
            <option value="">First matching component</option>
            {arch.components
              .filter(
                (c) =>
                  c.kind ===
                  (s.kind === "database-failure" ? "database" : "service"),
              )
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <button className="primary" disabled={busy} onClick={run}>
        <Play size={15} /> Run experiment
      </button>
    </section>
  );
}
export function Timeline({
  points,
  index,
  setIndex,
  alternative,
}: {
  points: Point[];
  index: number;
  setIndex: (n: number) => void;
  alternative?: Point[];
}) {
  const all = [...points, ...(alternative ?? [])],
    peak = Math.max(1, ...all.map((p) => p.result.p95_ms ?? 0));
  const x = (i: number) => 12 + (([0, 6, 12, 24][i] ?? 0) / 24) * 576;
  const y = (p: Point) => 79 - ((p.result.p95_ms ?? 0) / peak) * 65;
  const line = (series: Point[]) =>
    series
      .map((point, i) => {
        if (point.result.p95_ms === null) return "";
        const start = i === 0 || series[i - 1].result.p95_ms === null;
        return (start ? "M" : "L") + x(i) + " " + y(point);
      })
      .join(" ");
  return (
    <section className="sheet timeline">
      <div className="section-title">
        <Clock3 size={19} />
        <h2>Time machine</h2>
        <span className="unit">Successful-request p95 · ms</span>
      </div>
      {points.length > 0 ? (
        <>
          <div className="plot">
            <svg
              viewBox="0 0 600 94"
              preserveAspectRatio="none"
              role="img"
              aria-label="P95 latency over four hypothetical time horizons"
            >
              {[16, 48, 80].map((h) => (
                <line
                  key={h}
                  x1="0"
                  x2="600"
                  y1={h}
                  y2={h}
                  stroke="#283447"
                  strokeDasharray="4 5"
                />
              ))}
              <path
                d={line(points)}
                fill="none"
                stroke="#44c7c2"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
              {alternative && (
                <path
                  d={line(alternative)}
                  fill="none"
                  stroke="#ff926f"
                  strokeWidth="3"
                  strokeDasharray="7 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <line
                x1={x(index)}
                x2={x(index)}
                y1="0"
                y2="90"
                stroke="#627488"
                strokeDasharray="3 3"
              />
              {points.map(
                (p, i) =>
                  p.result.p95_ms !== null && (
                    <circle
                      key={p.month}
                      cx={x(i)}
                      cy={y(p)}
                      r={i === index ? 5 : 3}
                      fill="#44c7c2"
                    >
                      <title>
                        {p.month} months · {p.result.p95_ms ?? "unavailable"} ms
                      </title>
                    </circle>
                  ),
              )}
            </svg>
          </div>
          <div className="months" aria-label="Experiment horizon">
            {points.map((p, i) => (
              <button
                key={p.month}
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
              >
                {p.month === 0 ? "Today" : "Month " + p.month}
              </button>
            ))}
          </div>
          <div className="metric-grid">
            {[
              ["Offered load", points[index].result.offered_rps, "req/s"],
              ["Successful", points[index].result.success_pct, "%"],
              ["Tail latency", points[index].result.p95_ms ?? "—", "ms"],
              ["Assumed spend", points[index].result.monthly_usd, "$/mo"],
            ].map(([label, v, unit]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>
                  {v} <i>{unit}</i>
                </strong>
              </div>
            ))}
          </div>
          {alternative && (
            <div className="note">
              <GitCompareArrows size={15} />
              Alternative at this horizon ·{" "}
              {alternative[index].result.success_pct}% success ·{" "}
              {alternative[index].result.p95_ms ?? "—"} ms p95 · $
              {alternative[index].result.monthly_usd}/month
            </div>
          )}
        </>
      ) : (
        <p className="empty">Run an experiment to inspect its four horizons.</p>
      )}
      <small className="footnote">
        Each horizon is an independent what-if experiment with assumed inputs.
      </small>
    </section>
  );
}
