"use client";
import { useEffect, useState } from "react";
import {
  Boxes,
  Check,
  ChevronRight,
  Clock3,
  FlaskConical,
  GitBranch,
  Network,
  NotebookText,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { Impact, ComponentDetail, Layers } from "../components/AnalysisPanel";
import BriefDialog from "../components/BriefDialog";
import Topology from "../components/Topology";
import Inspector from "../components/Inspector";
import {
  Timeline,
  ScenarioForm,
  defaultScenario,
  scenarioNames,
  type Point,
} from "../components/Experiment";
import { Review, type Run } from "../components/Review";
import sample from "../../examples/ticketing.json";
import { api, type Architecture, type Scenario, type Style } from "./types";

const starter = sample as Architecture;
const initialBrief =
  "Reserve concert tickets and issue confirmations. Keep checkout p95 below 200 ms.";
const tabs = [
  "Architecture graph",
  "Impact analysis",
  "Time machine",
  "Design review",
  "Versions",
] as const;
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
    [tab, setTab] = useState<Tab>("Architecture graph"),
    [edit, setEdit] = useState(false),
    [showBrief, setShowBrief] = useState(false),
    [provider, setProvider] = useState("Connecting");
  const [showSpecs, setShowSpecs] = useState(true),
    [showProtocols, setShowProtocols] = useState(true),
    [showMap, setShowMap] = useState(true);
  const [panel, setPanel] = useState<"impact" | "component">("impact"),
    [panelOpen, setPanelOpen] = useState(true);
  const result = points[index]?.result;
  const board = tab !== "Design review" && tab !== "Versions";
  const part =
    arch.components.find((c) => c.id === selected) ?? arch.components[0];
  function go(t: Tab) {
    setTab(t);
    if (t === "Impact analysis") {
      setEdit(false);
      setPanel("impact");
      setPanelOpen(true);
    }
    const anchor =
      t === "Time machine"
        ? "experiments"
        : t === "Impact analysis"
          ? "analysis"
          : "app-top";
    requestAnimationFrame(() =>
      document.getElementById(anchor)?.scrollIntoView({ block: "start" }),
    );
  }
  function toggleEdit() {
    setEdit(!edit);
    setPanelOpen(true);
    setPanel("component");
    if (!edit && window.innerWidth < 1000)
      requestAnimationFrame(() =>
        document.getElementById("analysis")?.scrollIntoView({ block: "start" }),
      );
  }
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
    setEdit(false);
    setPanel("impact");
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
    go("Architecture graph");
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

  const versionLabel = dirty
    ? "Unsaved edits"
    : version
      ? "Saved · v" + version
      : run?.status === "awaiting_approval"
        ? "Awaiting approval"
        : "Sample workspace";
  const displayOptions = [
    { label: "Specifications", checked: showSpecs, set: setShowSpecs },
    { label: "Protocol labels", checked: showProtocols, set: setShowProtocols },
    { label: "Minimap", checked: showMap, set: setShowMap },
  ];
  const navIcons = [Network, ShieldCheck, Clock3, NotebookText, GitBranch];
  return (
    <main id="app-top">
      <header className="topbar">
        <div className="brand">
          <span className="brandmark">
            <Boxes size={29} strokeWidth={1.65} />
          </span>
          FutureStack<span className="brand-ai">AI</span>
        </div>
        <div className="crumb">
          <span>Workspace</span>
          <ChevronRight size={13} />
          <button onClick={() => go("Versions")} disabled={busy}>
            {arch.name}
          </button>
        </div>
        <div className="top-actions">
          <span className="engine">
            <i />
            {provider}
          </span>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              setShowBrief(true);
              setError("");
            }}
          >
            <Sparkles size={15} />
            Design from a brief
          </button>
        </div>
      </header>
      {showBrief && (
        <BriefDialog
          brief={brief}
          setBrief={setBrief}
          style={style}
          setStyle={setStyle}
          submit={() => act(generate)}
          busy={busy}
          error={error}
          close={() => setShowBrief(false)}
        />
      )}
      <fieldset
        disabled={busy}
        className={busy ? "workspace busy" : "workspace"}
      >
        <div className="console-shell">
          <aside className="rail">
            <div className="rail-top">
              <div className="rail-label">Workspace</div>
              <nav aria-label="Workbench views">
                {tabs.map((t, i) => {
                  const Icon = navIcons[i];
                  return (
                    <div key={t}>
                      {i === 3 && (
                        <div className="rail-label secondary-label">
                          Engineering
                        </div>
                      )}
                      <button
                        className={tab === t ? "chosen" : ""}
                        aria-current={tab === t ? "page" : undefined}
                        onClick={() => go(t)}
                      >
                        <Icon size={17} />
                        <span>{t}</span>
                      </button>
                    </div>
                  );
                })}
              </nav>
            </div>
            {board && (
              <details className="display-opts">
                <summary>
                  <SlidersHorizontal size={15} />
                  Graph display
                </summary>
                <div>
                  {displayOptions.map(({ label, checked, set }) => (
                    <label key={label}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => set(e.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </details>
            )}
          </aside>
          <div className="desk">
            <div aria-live="polite">
              {busy && !showBrief && (
                <div className="note">Processing workspace request…</div>
              )}
              {status && (
                <div className="note">
                  <Check size={14} />
                  {status}
                  <button
                    className="icon-btn right"
                    aria-label="Dismiss message"
                    onClick={() => setStatus("")}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              {error && !showBrief && (
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

            {board ? (
              <div className={"graph-row" + (panelOpen ? "" : " panel-hidden")}>
                <section className="graph-panel">
                  <div className="graph-heading">
                    <div className="graph-heading-text">
                      <p className="eyebrow">
                        <i />
                        Dependency map
                      </p>
                      <h1>{arch.name}</h1>
                    </div>
                    <div className="graph-buttons">
                      <button
                        disabled={!canEdit}
                        title="Edit graph"
                        onClick={toggleEdit}
                      >
                        <Pencil size={14} />
                        {edit ? "Finish editing" : "Edit graph"}
                      </button>
                      {!panelOpen && (
                        <button
                          className="icon-btn"
                          aria-label="Open analysis panel"
                          onClick={() => setPanelOpen(true)}
                        >
                          <PanelRightOpen size={17} />
                        </button>
                      )}
                    </div>
                  </div>
                  <Topology
                    key={(run?.id ?? "sample") + "-" + version}
                    arch={arch}
                    selected={selected}
                    select={(id) => {
                      select(id);
                      setPanel("component");
                      setPanelOpen(true);
                    }}
                    change={(a) => {
                      if (canEdit) change(a);
                    }}
                    editable={edit && canEdit}
                    result={result}
                    showSpecs={showSpecs}
                    showProtocols={showProtocols}
                    showMap={showMap}
                  />
                  <div className="graph-strip">
                    <span>
                      <i />
                      {arch.style}
                    </span>
                    <span>
                      {arch.components.length} components <em>/</em>{" "}
                      {arch.edges.length} dependencies
                    </span>
                    <label className="quick-horizon">
                      <Clock3 size={12} />
                      <select
                        aria-label="Simulation horizon"
                        disabled={!points.length}
                        value={index}
                        onChange={(e) => setIndex(Number(e.target.value))}
                      >
                        {[0, 6, 12, 24].map((m, i) => (
                          <option key={m} value={i}>
                            {m ? "Month " + m : "Today"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>
                {panelOpen && (
                  <aside className="analysis-panel" id="analysis">
                    <div className="panel-tabs">
                      <button
                        className={!edit && panel === "impact" ? "active" : ""}
                        onClick={() => {
                          setEdit(false);
                          setPanel("impact");
                        }}
                      >
                        Analysis
                      </button>
                      <button
                        className={
                          edit || panel === "component" ? "active" : ""
                        }
                        onClick={() => setPanel("component")}
                      >
                        Component
                      </button>
                      <button
                        aria-label="Collapse analysis panel"
                        title="Collapse panel"
                        className="icon-btn right"
                        onClick={() => {
                          setPanelOpen(false);
                          setEdit(false);
                        }}
                      >
                        <PanelRightClose size={15} />
                      </button>
                    </div>
                    {edit && canEdit ? (
                      <div className="editor-panel">
                        <Inspector
                          arch={arch}
                          id={selected}
                          select={select}
                          change={change}
                        />
                        {dirty && version > 0 && (
                          <button className="primary" onClick={() => act(save)}>
                            <Save size={15} />
                            Save new version
                          </button>
                        )}
                      </div>
                    ) : panel === "component" ? (
                      <ComponentDetail part={part} result={result} />
                    ) : (
                      <Impact
                        arch={arch}
                        result={result}
                        points={points}
                        month={[0, 6, 12, 24][index]}
                        canDownload={!!version && !dirty}
                        download={() => act(report)}
                      />
                    )}
                  </aside>
                )}
              </div>
            ) : (
              <div className="document-view">
                <div className="view-heading">
                  <p className="eyebrow">Engineering</p>
                  <h1>{tab}</h1>
                </div>
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
                                load(run.id, Number(e.target.value)).then(
                                  () => {},
                                ),
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
                          current workspace is the teal series.
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
              </div>
            )}
          </div>
        </div>
        {board && (
          <>
            <Layers arch={arch} result={result} />
            <section className="experiments" id="experiments">
              <div className="experiment-title">
                <span className="layer-icon">
                  <FlaskConical size={19} />
                </span>
                <div>
                  <p className="eyebrow">Scenario laboratory</p>
                  <h2>{scenarioNames[scenario.kind]}</h2>
                </div>
                <span className="experiment-month">
                  Horizon · {[0, 6, 12, 24][index]} months
                </span>
              </div>
              <div className="experiments-grid">
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
                <Timeline
                  points={points}
                  index={index}
                  setIndex={setIndex}
                  alternative={pair?.right}
                />
              </div>
              {result && (
                <details className="sheet assumptions">
                  <summary>Failure paths and model assumptions</summary>
                  <p>
                    {result.failed} foreground failures ·{" "}
                    {result.background_failed} background failures
                  </p>
                  {Object.entries(result.failure_paths).map(([p, n]) => (
                    <p key={p} className="path">
                      {p} · {n}
                    </p>
                  ))}
                  {scenario.kind === "budget-cap" && (
                    <p>
                      {result.budget_met
                        ? "Within budget"
                        : "Minimum footprint exceeds the budget"}
                    </p>
                  )}
                  <ul>
                    {result.assumptions.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </details>
              )}
              {dirty && version > 0 && !edit && (
                <button className="primary" onClick={() => act(save)}>
                  <Save size={15} />
                  Save new version
                </button>
              )}
            </section>
          </>
        )}
        <footer>
          <span>
            <span className="footer-dot" />
            {versionLabel}
          </span>
          <span>
            Deterministic simulation <em>/</em> Illustrative workloads and costs
          </span>
        </footer>
      </fieldset>
    </main>
  );
}
