"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Background,
  ConnectionMode,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useNodesState,
  useReactFlow,
  useViewport,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  Braces,
  Database,
  Focus,
  Hand,
  Layers3,
  Minus,
  MousePointer2,
  Plus,
  RadioTower,
  Server,
  Table2,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import type { Architecture, Part, Result } from "../app/types";

const icons = {
  gateway: RadioTower,
  service: Server,
  database: Database,
  queue: Layers3,
  worker: Workflow,
};
type PartNode = Node<
  { part: Part; active: boolean; affected: boolean; failed: boolean },
  "part"
>;
type SpecNode = Node<
  { kind: "endpoint" | "table"; name: string; detail: string },
  "spec"
>;
type GraphNode = PartNode | SpecNode;
const sides = [Position.Left, Position.Right, Position.Top, Position.Bottom];
function Ports({
  spec = false,
  enabled = false,
}: {
  spec?: boolean;
  enabled?: boolean;
}) {
  return (
    <>
      {sides.map((side) => (
        <Handle
          key={side}
          type={spec ? "target" : "source"}
          position={side}
          id={"port-" + side}
          isConnectable={enabled}
        />
      ))}
    </>
  );
}
function ComponentCard({ data, isConnectable }: NodeProps<PartNode>) {
  const c = data.part,
    Icon = icons[c.kind];
  return (
    <div
      className={[
        "part",
        c.kind,
        data.active && "active",
        data.affected && "affected",
        data.failed && "fault",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Ports enabled={isConnectable} />
      <div className="node-meta">
        <span>{c.kind}</span>
        <span>×{c.replicas}</span>
      </div>
      <div className="node-body">
        <span className="node-icon">
          <Icon size={22} strokeWidth={1.65} />
        </span>
        <div>
          <b>{c.name}</b>
          <small>{c.technology}</small>
        </div>
      </div>
      {data.failed && (
        <span className="fault-pin" title="Local failures observed">
          <TriangleAlert size={13} />
        </span>
      )}
    </div>
  );
}
function SpecCard({ data }: NodeProps<SpecNode>) {
  const Icon = data.kind === "table" ? Table2 : Braces;
  return (
    <div className="spec-card">
      <Ports spec />
      <div className="spec-meta">
        <Icon size={13} />
        {data.detail}
      </div>
      <b title={data.name}>{data.name}</b>
    </div>
  );
}
const nodeTypes = { part: ComponentCard, spec: SpecCard };
const fitOptions = { padding: 0.135, maxZoom: 1.22 };
function ViewTools({
  pan,
  setPan,
}: {
  pan: boolean;
  setPan: (value: boolean) => void;
}) {
  const flow = useReactFlow(),
    { zoom } = useViewport();
  return (
    <>
      <Panel position="top-left" className="graph-tools">
        <button
          title="Select components"
          aria-label="Select components"
          aria-pressed={!pan}
          onClick={() => setPan(false)}
        >
          <MousePointer2 />
        </button>
        <button
          title="Pan canvas"
          aria-label="Pan canvas"
          aria-pressed={pan}
          onClick={() => setPan(true)}
        >
          <Hand />
        </button>
        <button
          title="Fit graph"
          aria-label="Fit graph"
          onClick={() => flow.fitView({ ...fitOptions, duration: 200 })}
        >
          <Focus />
        </button>
      </Panel>
      <Panel position="top-right" className="graph-tools zoom">
        <button
          aria-label="Zoom out"
          onClick={() => flow.zoomOut({ duration: 140 })}
        >
          <Minus />
        </button>
        <output>{Math.round(zoom * 100)}%</output>
        <button
          aria-label="Zoom in"
          onClick={() => flow.zoomIn({ duration: 140 })}
        >
          <Plus />
        </button>
      </Panel>
    </>
  );
}
type XY = { x: number; y: number };
function graphPositions(parts: Part[]): Map<string, XY> {
  // Fold the generator's horizontal chain into two rows on the canvas. A manual
  // drag commits the displayed layout with the edit, so saved coordinates win.
  const ordered = [...parts].sort((a, b) => a.x - b.x);
  const defaultChain =
    ordered.length >= 3 &&
    ordered.length <= 4 &&
    ordered.every((p, i) => p.x === 230 * i && p.y === 50);
  const folded = [
    { x: 0, y: 96 },
    { x: 258, y: 42 },
    { x: 314, y: 213 },
    { x: 570, y: 118 },
  ];
  return new Map(
    ordered.map((p, i) => [
      p.id,
      defaultChain ? folded[i] : { x: p.x, y: p.y },
    ]),
  );
}
function connectionSides(a: XY, b: XY) {
  if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x))
    return b.y > a.y
      ? [Position.Bottom, Position.Top]
      : [Position.Top, Position.Bottom];
  return b.x > a.x
    ? [Position.Right, Position.Left]
    : [Position.Left, Position.Right];
}
export default function Topology({
  arch,
  select,
  selected,
  change,
  result,
  editable,
  showSpecs,
  showProtocols,
  showMap,
}: {
  arch: Architecture;
  select: (id: string) => void;
  selected: string;
  change: (arch: Architecture) => void;
  result?: Result;
  editable: boolean;
  showSpecs: boolean;
  showProtocols: boolean;
  showMap: boolean;
}) {
  const [pan, setPan] = useState(false),
    [edgeId, setEdgeId] = useState("");
  const graph = useMemo(() => {
    const positions = graphPositions(arch.components);
    const paths = Object.keys(result?.failure_paths ?? {}).map((p) =>
      p.split(" → "),
    );
    const impacted = new Set(paths.flat()),
      failedEdges = new Set(
        paths.flatMap((ids) => ids.slice(1).map((id, i) => ids[i] + "/" + id)),
      );
    const nodes: GraphNode[] = arch.components.map((part) => ({
      id: part.id,
      type: "part",
      position: positions.get(part.id)!,
      data: {
        part,
        active: part.id === selected,
        affected: impacted.has(part.id),
        failed: (result?.nodes[part.id]?.local_failures ?? 0) > 0,
      },
    }));
    const edges: Edge[] = arch.edges.map((e) => {
      const id = e.source + "/" + e.target,
        risk = failedEdges.has(id),
        a = positions.get(e.source),
        b = positions.get(e.target);
      const [from, to] =
        a && b ? connectionSides(a, b) : [Position.Right, Position.Left];
      const color = edgeId === id ? "#4cdbd5" : risk ? "#ff835f" : "#7199c8";
      return {
        ...e,
        id,
        sourceHandle: "port-" + from,
        targetHandle: "port-" + to,
        type: "default",
        className: risk ? "risk-edge" : "",
        label: showProtocols
          ? e.protocol + (e.mode === "async" ? " · async" : "")
          : undefined,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 13,
          height: 13,
        },
        style: {
          stroke: color,
          strokeWidth: risk ? 2.2 : 1.5,
          strokeDasharray: e.mode === "async" ? "5 3" : undefined,
        },
        labelStyle: {
          fill: risk ? "#ebb5a1" : "#aec0d9",
          fontSize: 10,
          fontFamily: "monospace",
        },
        labelBgStyle: { fill: "#0b1420" },
        labelBgPadding: [4, 3] as [number, number],
      };
    });
    if (showSpecs) {
      const gateway = arch.components.find((c) => c.kind === "gateway"),
        dbs = arch.components.filter((c) => c.kind === "database");
      const coords = [...positions.values()],
        top = Math.min(...coords.map((p) => p.y)),
        bottom = Math.max(...coords.map((p) => p.y));
      function addSpec(
        parent: Part | undefined,
        id: string,
        kind: "endpoint" | "table",
        name: string,
        detail: string,
        position: XY,
      ) {
        nodes.push({
          id,
          type: "spec",
          position,
          data: { kind, name, detail },
          draggable: false,
          selectable: false,
          connectable: false,
          focusable: false,
        });
        if (parent) {
          const [from, to] = connectionSides(
            positions.get(parent.id)!,
            position,
          );
          edges.push({
            id: "spec/" + id,
            source: parent.id,
            target: id,
            sourceHandle: "port-" + from,
            targetHandle: "port-" + to,
            type: "default",
            selectable: false,
            style: {
              stroke: "#526981",
              strokeDasharray: "4 5",
              strokeWidth: 1.3,
            },
          });
        }
      }
      // The API contract belongs at ingress. Associate tables only when the graph has a single database.
      const x = gateway ? positions.get(gateway.id)!.x : 0;
      if (arch.endpoints.length > 3)
        addSpec(
          gateway,
          "$api",
          "endpoint",
          arch.endpoints.length + " endpoints",
          "API contract",
          { x, y: top - 100 },
        );
      else
        arch.endpoints.forEach((e, i) =>
          addSpec(
            gateway,
            "$api" + i,
            "endpoint",
            e.path,
            e.method + " endpoint",
            { x: x + 80 + i * 216, y: top - 100 },
          ),
        );
      const dbx = dbs.length === 1 ? positions.get(dbs[0].id)!.x : 0;
      if (arch.tables.length > 3)
        addSpec(
          dbs.length === 1 ? dbs[0] : undefined,
          "$tables",
          "table",
          arch.tables.length + " tables",
          "Database schema",
          { x: dbx, y: bottom + 96 },
        );
      else
        arch.tables.forEach((t, i) =>
          addSpec(
            dbs.length === 1 ? dbs[0] : undefined,
            "$table" + i,
            "table",
            t.name,
            "Table · " + t.columns.length + " columns",
            { x: dbx - 108 + i * 216, y: bottom + 96 },
          ),
        );
    }
    return { nodes, edges };
  }, [arch, result, selected, edgeId, showSpecs, showProtocols]);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>(
    graph.nodes,
  );
  useEffect(() => setNodes(graph.nodes), [graph.nodes, setNodes]);
  return (
    <div className="canvas">
      <ReactFlow
        connectionMode={ConnectionMode.Loose}
        nodes={nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={fitOptions}
        minZoom={0.12}
        maxZoom={2.3}
        deleteKeyCode={null}
        colorMode="dark"
        panOnDrag={pan || !editable}
        nodesConnectable={editable && !pan}
        nodesDraggable={editable && !pan}
        onNodeClick={(_, n) => {
          if (n.type === "part") {
            select(n.id);
            setEdgeId("");
          }
        }}
        onEdgeClick={(_, e) => {
          if (editable && !e.id.startsWith("spec/")) setEdgeId(e.id);
        }}
        onNodeDragStop={(_, n) => {
          if (n.type !== "part") return;
          const pos = graphPositions(arch.components);
          change({
            ...arch,
            components: arch.components.map((c) => ({
              ...c,
              ...(c.id === n.id ? n.position : pos.get(c.id)),
            })),
          });
        }}
        onConnect={(c) => {
          if (
            editable &&
            !pan &&
            c.source !== c.target &&
            !arch.edges.some(
              (e) => e.source === c.source && e.target === c.target,
            )
          )
            change({
              ...arch,
              edges: [
                ...arch.edges,
                {
                  source: c.source,
                  target: c.target,
                  mode: "sync",
                  protocol: "HTTPS",
                },
              ],
            });
        }}
      >
        <Background gap={19} size={1} color="#263345" />
        <ViewTools pan={pan} setPan={setPan} />
        {showMap && (
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            maskColor="#050a11aa"
            nodeColor={(n) =>
              n.type === "spec"
                ? "#243d4c"
                : result?.nodes[n.id]?.local_failures
                  ? "#d46d50"
                  : "#426177"
            }
            nodeStrokeWidth={0}
          />
        )}
        <Panel position="bottom-right" className="legend">
          <span>
            <i />
            Dependency
          </span>
          <span>
            <i className="risk-line" />
            Failure path
          </span>
          {showSpecs && (
            <span>
              <i className="spec-line" />
              Specification
            </span>
          )}
        </Panel>
      </ReactFlow>
      {editable && edgeId && (
        <div className="edge-tools">
          <span>{edgeId}</span>
          <button
            onClick={() =>
              change({
                ...arch,
                edges: arch.edges.map((e) =>
                  e.source + "/" + e.target === edgeId
                    ? { ...e, mode: e.mode === "sync" ? "async" : "sync" }
                    : e,
                ),
              })
            }
          >
            Toggle delivery
          </button>
          <button
            onClick={() => {
              change({
                ...arch,
                edges: arch.edges.filter(
                  (e) => e.source + "/" + e.target !== edgeId,
                ),
              });
              setEdgeId("");
            }}
          >
            Remove link
          </button>
        </div>
      )}
    </div>
  );
}
