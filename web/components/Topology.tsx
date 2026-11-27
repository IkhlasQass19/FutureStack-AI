"use client";
import { useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { Database, Layers3, Radio, Server, Workflow } from "lucide-react";
import type { Architecture, Part, Result } from "../app/types";

const icons = {
  gateway: Radio,
  service: Server,
  database: Database,
  queue: Layers3,
  worker: Workflow,
};
type Card = Node<{ part: Part; affected: boolean; active: boolean }, "part">;
function ComponentCard({ data }: NodeProps<Card>) {
  const c = data.part,
    Icon = icons[c.kind];
  return (
    <div
      className={
        "part " +
        c.kind +
        (data.affected ? " affected" : "") +
        (data.active ? " active" : "")
      }
    >
      <Handle type="target" position={Position.Left} />
      <div className="nodekind">
        <Icon size={17} />
        {c.kind}
      </div>
      <b>{c.name}</b>
      <small>
        {c.technology} · ×{c.replicas}
      </small>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { part: ComponentCard };
export default function Topology({
  arch,
  select,
  selected,
  change,
  result,
  editable,
}: {
  editable: boolean;
  arch: Architecture;
  select: (id: string) => void;
  selected: string;
  change: (a: Architecture) => void;
  result?: Result;
}) {
  const [edgeId, setEdgeId] = useState("");
  const failed = new Set(
    Object.keys(result?.failure_paths ?? {}).flatMap((path) =>
      path.split(" → "),
    ),
  );
  const failedEdges = new Set(
    Object.keys(result?.failure_paths ?? {}).flatMap((path) => {
      const ids = path.split(" → ");
      return ids.slice(1).map((v, i) => ids[i] + "/" + v);
    }),
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Card>([]);
  useEffect(() => {
    setNodes(
      arch.components.map((c) => ({
        id: c.id,
        type: "part",
        position: { x: c.x, y: c.y },
        data: {
          part: c,
          affected: failed.has(c.id),
          active: selected === c.id,
        },
      })),
    );
  }, [arch, selected, result, setNodes]); // eslint-disable-line react-hooks/exhaustive-deps
  const edges = arch.edges.map((e) => {
    const id = e.source + "/" + e.target;
    const color = failedEdges.has(id)
      ? "#c94e31"
      : id === edgeId
        ? "#386dd9"
        : "#88a4a4";
    return {
      ...e,
      id,
      type: "smoothstep",
      label: e.protocol + (e.mode === "async" ? " · async" : ""),
      style: { stroke: color, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color },
      labelStyle: { fontSize: 10, fill: "#4b6568" },
      labelBgStyle: { fill: "#f6f9f7" },
    };
  });
  return (
    <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        minZoom={0.25}
        deleteKeyCode={null}
        onNodeClick={(_, n) => {
          select(n.id);
          setEdgeId("");
        }}
        nodesDraggable={editable}
        nodesConnectable={editable}
        onEdgeClick={(_, e) => {
          if (editable) setEdgeId(e.id);
        }}
        onNodeDragStop={(_, n) =>
          change({
            ...arch,
            components: arch.components.map((c) =>
              c.id === n.id ? { ...c, ...n.position } : c,
            ),
          })
        }
        onConnect={(c) => {
          if (
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
        <Background gap={18} size={1.2} color="#c3d3ce" />
        <Controls showInteractive={false} />
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
