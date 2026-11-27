import {
  Activity,
  ChartNoAxesCombined,
  CircleCheck,
  Download,
  Fingerprint,
  Gauge,
  GitFork,
  Layers3,
  Network,
  Server,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import type { Architecture, Part, Result } from "../app/types";
import type { Point } from "./Experiment";

const number = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 2 });
function LatencyLine({ points }: { points: Point[] }) {
  const peak = Math.max(1, ...points.map((p) => p.result.p95_ms ?? 0));
  const d = points
    .map((p, i) =>
      p.result.p95_ms === null
        ? ""
        : (!i || points[i - 1].result.p95_ms === null ? "M" : "L") +
          (2 + p.month * 2.5) +
          " " +
          (25 - (p.result.p95_ms / peak) * 19),
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 66 30"
      aria-label="Latency over four simulation horizons"
      role="img"
      className="sparkline"
    >
      <path d={d} stroke="currentColor" fill="none" strokeWidth="1.8" />
    </svg>
  );
}
export function Impact({
  arch,
  result,
  points,
  month,
  download,
  canDownload,
}: {
  arch: Architecture;
  result?: Result;
  points: Point[];
  month: number;
  download: () => void;
  canDownload: boolean;
}) {
  const paths = Object.entries(result?.failure_paths ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  const risk = paths.length > 0,
    hot = arch.components.find((c) => c.id === result?.bottleneck);
  return (
    <>
      <div className="panel-heading">
        <ShieldAlert size={17} />
        <h2>Impact analysis</h2>
      </div>
      <div className="impact-body">
        {result ? (
          <>
            <div className="risk-overview">
              <span className={"signal " + (risk ? "warn" : "clear")}>
                {risk ? <TriangleAlert size={12} /> : <CircleCheck size={12} />}{" "}
                {risk ? "Failure path observed" : "No failures observed"}
              </span>
              {risk && (
                <div className="chain path">
                  {paths[0][0].split(" → ").map((p, i) => (
                    <span key={i}>
                      {i > 0 && <em>→</em>}
                      {p}
                    </span>
                  ))}
                </div>
              )}
              <p>
                {number(result.failed)} of {number(result.requests)} requests
                failed in the{" "}
                {month === 0
                  ? "baseline horizon"
                  : "month " + month + " scenario"}
                .
              </p>
            </div>
            <div className="analysis-stat">
              <div className="stat-label">
                <Gauge />
                Request success
              </div>
              <strong>
                {number(result.success_pct)}
                <small>%</small>
              </strong>
              <div className="progress-track">
                <i style={{ width: result.success_pct + "%" }} />
              </div>
            </div>
            <div className="analysis-stat">
              <div className="stat-label">
                <Activity />
                P95 latency
              </div>
              <div className="stat-row">
                <strong>
                  {result.p95_ms === null ? "—" : number(result.p95_ms)}{" "}
                  <small>ms</small>
                </strong>
                <LatencyLine points={points} />
              </div>
            </div>
            <div className="analysis-stat">
              <div className="stat-label">
                <GitFork />
                Queue bottleneck
              </div>
              <h3>{hot?.name ?? "No queuing"}</h3>
              {hot && (
                <small>
                  Peak queue · {result.nodes[hot.id].peak_queue} waiting
                </small>
              )}
            </div>
            <div className="analysis-stat single-points">
              <div className="stat-label">
                <Fingerprint />
                Single-replica dependencies
              </div>
              <div className="tokens">
                {result.single_points.length ? (
                  result.single_points.map((s) => <code key={s}>{s}</code>)
                ) : (
                  <span>None</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="empty">
            Run an experiment to see how failures propagate through this
            architecture.
          </p>
        )}
      </div>
      <div className="report-action">
        <button
          disabled={!canDownload}
          onClick={download}
          title={
            canDownload
              ? "Download this revision’s engineering report"
              : "Approve and save a design to download its report"
          }
        >
          <Download size={15} />
          Download report
        </button>
      </div>
    </>
  );
}
export function ComponentDetail({
  part,
  result,
}: {
  part: Part;
  result?: Result;
}) {
  const stats = result?.nodes[part.id];
  return (
    <>
      <div className="panel-heading">
        <Server size={17} />
        <h2>Component details</h2>
      </div>
      <div className="impact-body">
        <div className="component-detail">
          <span className="eyebrow">{part.kind}</span>
          <h2>{part.name}</h2>
          <code>{part.id}</code>
          <p>{part.rationale}</p>
        </div>
        <dl className="detail-list">
          {[
            ["Technology", part.technology],
            ["Replicas", part.replicas],
            ["Slots per replica", part.slots],
            ["Service time", part.service_ms + " ms"],
            [
              "Assumed spend",
              "$" + number(part.monthly_usd * part.replicas) + "/mo",
            ],
            ["Local failures", stats?.local_failures ?? "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
export function Layers({
  arch,
  result,
}: {
  arch: Architecture;
  result?: Result;
}) {
  const groups = [
    {
      title: "Architecture",
      sub: "Dependency model",
      icon: Network,
      tone: "blue",
      values: [
        ["Components", arch.components.length],
        ["Links", arch.edges.length],
        ["Endpoints", arch.endpoints.length],
      ],
    },
    {
      title: "Simulation",
      sub: "Selected horizon",
      icon: ChartNoAxesCombined,
      tone: "aqua",
      values: [
        ["Requests", result ? number(result.requests) : "—"],
        ["Succeeded", result ? number(result.succeeded) : "—"],
        ["Failed", result ? number(result.failed) : "—"],
      ],
    },
    {
      title: "Infrastructure",
      sub: "Assumed capacity & cost",
      icon: Layers3,
      tone: "violet",
      values: [
        [
          "Replicas",
          result
            ? Object.values(result.nodes).reduce(
                (sum, n) => sum + n.effective_replicas,
                0,
              )
            : arch.components.reduce((sum, n) => sum + n.replicas, 0),
        ],
        [
          "Databases",
          arch.components.filter((c) => c.kind === "database").length,
        ],
        ["Monthly cost", result ? "$" + number(result.monthly_usd) : "—"],
      ],
    },
  ];
  return (
    <div className="layer-grid">
      {groups.map(({ title, sub, icon: Icon, tone, values }) => (
        <section className={"layer-card " + tone} key={title}>
          <div className="layer-head">
            <span className="layer-icon">
              <Icon size={21} />
            </span>
            <div>
              <h3>{title}</h3>
              <small>{sub}</small>
            </div>
          </div>
          <dl>
            {values.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className={k === "Failed" && Number(v) > 0 ? "warm" : ""}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
