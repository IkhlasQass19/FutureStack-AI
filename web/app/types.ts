export type Kind = "gateway" | "service" | "database" | "queue" | "worker";
export type Style = "monolith" | "microservices" | "event-driven";
export type Part = {
  id: string;
  name: string;
  kind: Kind;
  technology: string;
  rationale: string;
  requirements: string[];
  replicas: number;
  slots: number;
  service_ms: number;
  monthly_usd: number;
  x: number;
  y: number;
};
export type EdgeSpec = {
  source: string;
  target: string;
  mode: "sync" | "async";
  protocol: string;
};
export type Architecture = {
  name: string;
  style: Style;
  components: Part[];
  edges: EdgeSpec[];
  endpoints: {
    method: string;
    path: string;
    purpose: string;
    request: string;
    response: string;
  }[];
  tables: { name: string; columns: string[] }[];
};
export type Result = {
  offered_rps: number;
  requests: number;
  succeeded: number;
  failed: number;
  success_pct: number;
  p95_ms: number | null;
  monthly_usd: number;
  budget_met: boolean;
  background_failed: number;
  nodes: Record<
    string,
    {
      mean_wait_ms: number;
      peak_queue: number;
      local_failures: number;
      effective_replicas: number;
    }
  >;
  bottleneck: string | null;
  failure_paths: Record<string, number>;
  single_points: string[];
  assumptions: string[];
};
export type Scenario = {
  kind: string;
  rps: number;
  duration_s: number;
  horizon: number;
  budget_usd: number;
  target?: string;
};
export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const res = await fetch("/api/lab/" + path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const message = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      typeof message.detail === "string"
        ? message.detail
        : JSON.stringify(message.detail),
    );
  }
  return res.json();
}
