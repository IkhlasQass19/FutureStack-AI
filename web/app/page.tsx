"use client";
import { useEffect, useState } from "react";
import {
  Activity,
  Boxes,
  Check,
  Clock3,
  Download,
  GitBranch,
  Layers3,
  Pencil,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Topology from "../components/Topology";
import Inspector from "../components/Inspector";
import {
  Timeline,
  ScenarioForm,
  defaultScenario,
  type Point,
} from "../components/Experiment";
import { Review, type Run } from "../components/Review";
import sample from "../../examples/ticketing.json";
import { api, type Architecture, type Scenario, type Style } from "./types";

const starter = sample as Architecture;
const initialBrief =
  "Reserve concert tickets and issue confirmations. Keep checkout p95 below 200 ms.";
const tabs = ["Time machine", "Design review", "Versions"] as const;
type Tab = (typeof tabs)[number];
type Recent = { id: string; created: number; head: number; status: string };
type Pair = {
  left: Point[];
  right: Point[];
  diff: {
    added: string[];
    removed: string[];
    modified: Record<string, unknown>;
    edges_added: unknown[];
    edges_removed: unknown[];
    spec_changes: Record<string, unknown>;
  };
};
export default function Lab() {
  const [arch, setArch] = useState<Architecture>(starter),
    [selected, select] = useState("api"),
    [brief, setBrief] = useState(initialBrief),
    [style, setStyle] = useState<Style>("microservices");
  const [run, setRun] = useState<Run>(),
    [version, setVersion] = useState(0),
    [dirty, setDirty] = useState(false),
    [recent, setRecent] = useState<Recent[]>([]);
  const [scenario, setScenario] = useState<Scenario>(defaultScenario),
    [points, setPoints] = useState<Point[]>([]),
    [index, setIndex] = useState(2);
  const [pair, setPair] = useState<Pair>(),
    [other, setOther] = useState(1),
    [otherRun, setOtherRun] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [tab, setTab] = useState<Tab>("Time machine"),
    [edit, setEdit] = useState(false),
    [showBrief, setShowBrief] = useState(false),
    [provider, setProvider] = useState("Connecting");
  const result = points[index]?.result;
  function invalidate() {
    setPoints([]);
    setPair(undefined);
    setStatus("");
  }
  function change(a: Architecture) {
    setArch(a);
    setDirty(true);
    invalidate();
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load(key: string, num?: number) {
    const r = await api<Run>("runs/" + key),
      n = num ?? r.head;
    const a = n
      ? await api<Architecture>("runs/" + key + "/versions/" + n)
      : r.state.architecture;
    setRun(r);
    setVersion(n);
    setDirty(false);
    setBrief(r.state.brief.text);
    setStyle(r.state.brief.style);
    setArch(a ?? starter);
    select((a ?? starter).components[0].id);
    setOther(Math.max(1, n - 1));
    setOtherRun(key);
    invalidate();
    localStorage.setItem("futurestack.run", key);
    if (r.state.error) setError(r.state.error);
    return a;
  }
  useEffect(() => {
    let active = true;
    (async () => {
      setBusy(true);
      try {
        const [cfg, list] = await Promise.all([
          api<{ provider: string }>("config"),
          api<Recent[]>("runs"),
        ]);
        if (!active) return;
        setProvider(
          cfg.provider === "demo" ? "Offline generator" : cfg.provider,
        );
        setRecent(list);
        let a: Architecture | undefined = starter;
        const key = localStorage.getItem("futurestack.run");
        if (key && list.some((x) => x.id === key)) a = await load(key);
        if (a) {
          const data = await api<Point[]>("timeline", {
            architecture: a,
            scenario: defaultScenario,
          });
          if (active) setPoints(data);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function execute(key: string) {
    const r = await api<Run>("runs/" + key + "/execute", {});
    await load(r.id);
    setTab("Design review");
    setShowBrief(false);
    setRecent(await api<Recent[]>("runs"));
    if (r.status === "failed")
      throw new Error(
        r.state.error ?? "Review failed; resume from the last completed stage.",
      );
    setStatus("Review ready for approval.");
  }
  async function generate() {
    const r = await api<Run>("runs", { text: brief, style });
    setRun(r);
    setVersion(0);
    setDirty(false);
    invalidate();
    localStorage.setItem("futurestack.run", r.id);
    await execute(r.id);
  }
  async function save() {
    if (!run) return;
    if (run.status === "awaiting_approval") {
      const v = await api<{ number: number }>(
        "runs/" + run.id + "/approve",
        {},
      );
      await load(run.id, v.number);
    } else {
      const v = await api<{ number: number }>("runs/" + run.id + "/versions", {
        base: version,
        architecture: arch,
      });
      await load(run.id, v.number);
    }
    setRecent(await api<Recent[]>("runs"));
    setStatus("Version saved.");
    setTab("Time machine");
  }
  async function experiment() {
    const data = await api<Point[]>("timeline", {
      architecture: arch,
      scenario,
    });
    setPoints(data);
    setPair(undefined);
    setStatus("Experiment complete.");
  }
  async function report() {
    const res = await fetch(
      "/api/lab/runs/" + run!.id + "/versions/" + version + "/report",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scenario, horizon: [0, 6, 12, 24][index] }),
      },
    );
    if (!res.ok) throw new Error("Report generation failed.");
    const url = URL.createObjectURL(await res.blob()),
      link = document.createElement("a");
    link.href = url;
    link.download = "futurestack-v" + version + ".md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const canEdit = !run || run.status === "approved";
  return (
    <main>
      <header>
        <div className="wrap topbar">
          <div className="brand">
            <span className="brandmark">
              <Boxes size={21} />
            </span>{" "}
            FutureStack <em>AI</em>
          </div>
          <span className="connection">
            <i /> {provider}
          </span>
        </div>
      </header>
      <fieldset
        disabled={busy}
        className={busy ? "workspace busy" : "workspace"}
      >
        <div className="wrap">
          <div className="intro">
            <div>
              <p className="eyebrow">Software architecture lab</p>
              <h1>
                Architecture time machine<span>.</span>
              </h1>
              <p className="subtitle">
                Explore how a design behaves as demand and infrastructure
                change.
              </p>
            </div>
            <button
              className="primary"
              onClick={() => setShowBrief(!showBrief)}
            >
              <Sparkles size={16} /> Design from a brief
            </button>
          </div>
          {showBrief && (
            <section className="sheet brief">
              <h2>Business requirements</h2>
              <label>
                Business brief
                <textarea
                  value={brief}
                  maxLength={6000}
                  onChange={(e) => setBrief(e.target.value)}
                />
              </label>
              <div className="actions">
                <select
                  aria-label="Architecture style"
                  value={style}
                  onChange={(e) => setStyle(e.target.value as Style)}
                >
                  {["microservices", "monolith", "event-driven"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <button
                  className="primary"
                  disabled={brief.trim().length < 12}
                  onClick={() => act(generate)}
                >
                  Generate and review
                </button>
              </div>
            </section>
          )}
          <nav className="tabs" aria-label="Workbench views">
            {tabs.map((t, i) => {
              const Icon = [Clock3, ShieldCheck, GitBranch][i];
              return (
                <button
                  key={t}
                  className={tab === t ? "chosen" : ""}
                  aria-current={tab === t ? "page" : undefined}
                  onClick={() => setTab(t)}
                >
                  <Icon size={16} /> {t}
                </button>
              );
            })}
            <span className="workspace-state">
              {dirty
                ? "Unsaved edits"
                : version
                  ? "Saved · v" + version
                  : run?.status === "awaiting_approval"
                    ? "Awaiting approval"
                    : "Sample workspace"}
            </span>
          </nav>
          <div aria-live="polite">
            {busy && (
              <div className="note">
                Processing experiment or workspace request…
              </div>
            )}
            {status && <div className="note">{status}</div>}
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
          </div>
          {run?.status === "awaiting_approval" && (
            <div className="gate">
              <div>
                <b>Human approval required</b>
                <p>Inspect the initial review before saving version 1.</p>
              </div>
              <button onClick={() => act(save)}>
                <Check size={15} /> Approve design
              </button>
            </div>
          )}
          {run && ["ready", "failed", "running"].includes(run.status) && (
            <div className="gate">
              <span>Workflow · {run.status}</span>
              <button onClick={() => act(() => execute(run.id))}>
                Resume review
              </button>
            </div>
          )}
          {tab === "Time machine" && (
            <div className="lab-grid">
              <div>
                <section className="sheet topology">
                  <div className="section-title">
                    <div className="title-icon">
                      <Layers3 size={20} />
                    </div>
                    <div>
                      <p className="eyebrow">Architecture topology</p>
                      <h2>{arch.name}</h2>
                    </div>
                    <button
                      disabled={!canEdit}
                      className="right"
                      onClick={() => setEdit(!edit)}
                    >
                      <Pencil size={13} />
                      {edit ? "Finish editing" : "Edit graph"}
                    </button>
                  </div>
                  <Topology
                    key={(run?.id ?? "sample") + "-" + version}
                    arch={arch}
                    selected={selected}
                    select={select}
                    change={(a) => {
                      if (canEdit) change(a);
                    }}
                    result={result}
                    editable={edit && canEdit}
                  />
                  <div className="canvas-caption">
                    <span>
                      <i className="dot" /> {arch.style} ·{" "}
                      {arch.components.length} components
                    </span>
                    <span>
                      {result && Object.keys(result.failure_paths).length
                        ? "Orange = observed failure path"
                        : "Arrows follow request flow"}
                    </span>
                  </div>
                </section>
                <Timeline
                  points={points}
                  index={index}
                  setIndex={setIndex}
                  alternative={pair?.right}
                />
                <section className="sheet">
                  <div className="section-title">
                    <Activity size={18} />
                    <h2>Failure propagation</h2>
                  </div>
                  {result ? (
                    <>
                      <p>
                        {result.failed} foreground failures ·{" "}
                        {result.background_failed} background failures ·{" "}
                        {result.requests} offered requests
                      </p>
                      {Object.entries(result.failure_paths).map(([p, n]) => (
                        <p className="path" key={p}>
                          {p} <b>× {n}</b>
                        </p>
                      ))}
                      <details>
                        <summary>Model assumptions</summary>
                        <ul>
                          {result.assumptions.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </details>
                    </>
                  ) : (
                    <p className="empty">
                      Run the current graph to inspect failure paths.
                    </p>
                  )}
                </section>
              </div>
              <aside>
                {edit && canEdit && (
                  <Inspector
                    arch={arch}
                    id={selected}
                    select={select}
                    change={change}
                  />
                )}
                <ScenarioForm
                  scenario={scenario}
                  change={(s) => {
                    setScenario(s);
                    invalidate();
                  }}
                  arch={arch}
                  busy={busy}
                  run={() => act(experiment)}
                />
                <section className="risk">
                  <p className="eyebrow">At the selected horizon</p>
                  <h2>Risk assessment</h2>
                  {result ? (
                    <>
                      <div>
                        <small>Largest mean queue delay</small>
                        <b>{result.bottleneck ?? "No queuing"}</b>
                      </div>
                      <div>
                        <small>Single-replica dependencies</small>
                        <b>{result.single_points.join(", ") || "None"}</b>
                      </div>
                      {scenario.kind === "budget-cap" && (
                        <div>
                          <small>Budget target</small>
                          <b>
                            {result.budget_met
                              ? "Within cap"
                              : "Minimum footprint exceeds cap"}
                          </b>
                        </div>
                      )}
                    </>
                  ) : (
                    <p>Run an experiment to assess this design.</p>
                  )}
                </section>
                <section className="sheet">
                  <h2>Engineering report</h2>
                  <p className="small muted">
                    Includes the saved graph, scenario, results, assumptions and
                    original review evidence.
                  </p>
                  <button
                    disabled={!version || dirty}
                    onClick={() => act(report)}
                  >
                    <Download size={15} /> Download report
                  </button>
                  {!version && (
                    <small className="footnote">
                      Generate and approve a design to export.
                    </small>
                  )}
                </section>
                {dirty && version > 0 && (
                  <button className="primary" onClick={() => act(save)}>
                    <Save size={15} /> Save new version
                  </button>
                )}
              </aside>
            </div>
          )}
          {tab === "Design review" && (
            <>
              <Review run={run} />
              <section className="sheet">
                <h2>API and database specifications</h2>
                {arch.endpoints.map((e) => (
                  <article key={e.method + e.path}>
                    <code>
                      {e.method} {e.path}
                    </code>
                    <p>
                      {e.purpose} · {e.request} → {e.response}
                    </p>
                  </article>
                ))}
                {arch.tables.map((t) => (
                  <article key={t.name}>
                    <b>{t.name}</b>
                    <p>{t.columns.join(" · ")}</p>
                  </article>
                ))}
              </section>
            </>
          )}
          {tab === "Versions" && (
            <>
              <section className="sheet controls">
                <h2>Saved workspaces</h2>
                <label>
                  Workspace
                  <select
                    value={run?.id ?? ""}
                    onChange={(e) =>
                      act(() => load(e.target.value).then(() => {}))
                    }
                  >
                    <option value="" disabled>
                      Select a run
                    </option>
                    {recent.map((r) => (
                      <option key={r.id} value={r.id}>
                        {new Date(r.created * 1000).toLocaleString()} ·{" "}
                        {r.status} · {r.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                {run && run.head > 0 && (
                  <label>
                    Revision
                    <select
                      value={version}
                      onChange={(e) =>
                        act(() =>
                          load(run.id, Number(e.target.value)).then(() => {}),
                        )
                      }
                    >
                      {Array.from({ length: run.head }, (_, i) => (
                        <option value={i + 1} key={i}>
                          Version {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </section>
              {run && version > 0 && (
                <section className="sheet controls">
                  <h2>Compare with another architecture</h2>
                  <p>
                    Apply the current scenario to both saved designs. The
                    current workspace is the green series.
                  </p>
                  <label>
                    Alternative workspace
                    <select
                      value={otherRun}
                      onChange={(e) => {
                        setOtherRun(e.target.value);
                        setOther(1);
                        setPair(undefined);
                      }}
                    >
                      {recent
                        .filter((r) => r.head > 0)
                        .map((r) => (
                          <option value={r.id} key={r.id}>
                            {r.id.slice(0, 8)} · {r.head} versions
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Alternative revision
                    <select
                      value={other}
                      onChange={(e) => {
                        setOther(Number(e.target.value));
                        setPair(undefined);
                      }}
                    >
                      {Array.from(
                        {
                          length:
                            recent.find((r) => r.id === otherRun)?.head ??
                            run.head,
                        },
                        (_, i) => (
                          <option key={i} value={i + 1}>
                            Version {i + 1}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <button
                    className="primary"
                    disabled={dirty}
                    onClick={() =>
                      act(async () => {
                        const p = await api<Pair>(
                          "runs/" + run.id + "/compare",
                          {
                            left: version,
                            right: other,
                            right_run: otherRun,
                            scenario,
                          },
                        );
                        setPair(p);
                        setPoints(p.left);
                      })
                    }
                  >
                    Compare versions
                  </button>
                  {pair && (
                    <>
                      <Timeline
                        points={pair.left}
                        alternative={pair.right}
                        index={index}
                        setIndex={setIndex}
                      />
                      <details open>
                        <summary>Architecture changes</summary>
                        <pre>{JSON.stringify(pair.diff, null, 2)}</pre>
                      </details>
                    </>
                  )}
                </section>
              )}
            </>
          )}
          <footer>
            <span>FutureStack AI</span>
            <span>
              Deterministic simulations · Illustrative workloads and costs
            </span>
          </footer>
        </div>
      </fieldset>
    </main>
  );
}
