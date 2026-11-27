"use client";
import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { Architecture, Part, Kind } from "../app/types";
export default function Inspector({
  arch,
  id,
  select,
  change,
}: {
  arch: Architecture;
  id: string;
  select: (s: string) => void;
  change: (a: Architecture) => void;
}) {
  const c = arch.components.find((c) => c.id === id) ?? arch.components[0];
  const patch = (parts: Partial<Part>) =>
    change({
      ...arch,
      components: arch.components.map((n) =>
        n.id === c.id ? { ...n, ...parts } : n,
      ),
    });
  function add() {
    let i = 1;
    while (arch.components.some((n) => n.id === "service_" + i)) i++;
    const id = "service_" + i;
    const node: Part = {
      id,
      name: "New service",
      kind: "service",
      technology: "FastAPI",
      rationale: "Handles requests delegated by " + c.name,
      requirements: [],
      slots: 2,
      replicas: 1,
      service_ms: 30,
      monthly_usd: 35,
      x: c.x + 180,
      y: c.y + 140,
    };
    change({
      ...arch,
      components: [...arch.components, node],
      edges: [
        ...arch.edges,
        { source: c.id, target: id, mode: "sync", protocol: "HTTPS" },
      ],
    });
    select(id);
  }
  return (
    <section className="sheet controls">
      <div className="section-title">
        <SlidersHorizontal size={18} />
        <h2>Component inspector</h2>
      </div>
      <label>
        Component
        <select
          aria-label="Component"
          value={c.id}
          onChange={(e) => select(e.target.value)}
        >
          {arch.components.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Name
        <input
          value={c.name}
          maxLength={90}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>
      <div className="two">
        <label>
          Kind
          <select
            disabled={c.kind === "gateway"}
            value={c.kind}
            onChange={(e) => patch({ kind: e.target.value as Kind })}
          >
            {(c.kind === "gateway"
              ? ["gateway"]
              : ["service", "database", "worker", "queue"]
            ).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Replicas
          <input
            type="number"
            min="1"
            max="32"
            value={c.replicas}
            onChange={(e) => patch({ replicas: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="two">
        <label>
          Service time · ms
          <input
            type="number"
            min="1"
            max="5000"
            value={c.service_ms}
            onChange={(e) => patch({ service_ms: Number(e.target.value) })}
          />
        </label>
        <label>
          Slots / replica
          <input
            type="number"
            min="1"
            max="64"
            value={c.slots}
            onChange={(e) => patch({ slots: Number(e.target.value) })}
          />
        </label>
      </div>
      <details>
        <summary>Technology and cost</summary>
        <label>
          Technology
          <input
            value={c.technology}
            onChange={(e) => patch({ technology: e.target.value })}
          />
        </label>
        <label>
          Design rationale
          <textarea
            value={c.rationale}
            onChange={(e) => patch({ rationale: e.target.value })}
          />
        </label>
        <label>
          USD / replica / month
          <input
            type="number"
            min="0"
            value={c.monthly_usd}
            onChange={(e) => patch({ monthly_usd: Number(e.target.value) })}
          />
        </label>
      </details>
      <div className="actions">
        <button onClick={add}>
          <Plus size={14} /> Add downstream
        </button>
        <button
          disabled={c.kind === "gateway"}
          aria-label="Remove component"
          onClick={() => {
            change({
              ...arch,
              components: arch.components.filter((n) => n.id !== c.id),
              edges: arch.edges.filter(
                (e) => e.source !== c.id && e.target !== c.id,
              ),
            });
            select(arch.components.find((n) => n.kind === "gateway")!.id);
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </section>
  );
}
