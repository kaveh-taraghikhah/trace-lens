import {
  DEMO_SERVICES,
  type ServiceMap,
  type ServiceMapEdge,
  type ServiceMapNode,
} from "@tracelens/types";
import { PrometheusClient, type PrometheusQueryResult } from "./client.js";
import { getServicesOverview } from "./services.js";

const IGNORE_TARGETS = new Set([
  "localhost",
  "127.0.0.1",
  "otel-collector",
  "prometheus",
  "tempo",
  "loki",
  "grafana",
]);

function edgeKey(source: string, target: string): string {
  return `${source}->${target}`;
}

function vectorPairs(
  result: PrometheusQueryResult,
  sourceLabel: string,
  targetLabel: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of result.data?.result ?? []) {
    const source = row.metric[sourceLabel];
    const target = row.metric[targetLabel];
    if (!source || !target || !row.value) continue;
    if (IGNORE_TARGETS.has(target) || IGNORE_TARGETS.has(source)) continue;
    const n = Number(row.value[1]);
    if (!Number.isFinite(n)) continue;
    map.set(edgeKey(source, target), n);
  }
  return map;
}

/** Fallback topology when no client metrics yet. */
const FALLBACK_EDGES: Array<[string, string]> = [
  ["shop-api", "product-api"],
  ["shop-api", "order-api"],
  ["order-api", "product-api"],
  ["order-api", "payment-api"],
  ["order-api", "notification-worker"],
];

export async function getServiceMap(prometheusUrl: string): Promise<ServiceMap> {
  const client = new PrometheusClient(prometheusUrl);
  const ready = await client.ready();

  const overview = await getServicesOverview(prometheusUrl);
  const nodeByName = new Map(
    overview.services.map((s) => [s.name, s] as const),
  );

  if (!ready) {
    const nodes: ServiceMapNode[] = DEMO_SERVICES.map((id) => ({
      id,
      health: "unknown",
      requestsPerSecond: null,
      errorRate: null,
      p95LatencyMs: null,
    }));
    return {
      nodes,
      edges: FALLBACK_EDGES.map(([source, target]) => ({
        id: edgeKey(source, target),
        source,
        target,
        requestsPerSecond: null,
        errorRate: null,
        p95LatencyMs: null,
      })),
      generatedAt: new Date().toISOString(),
      backend: {
        prometheus: "unavailable",
        message: "Metrics backend temporarily unavailable.",
      },
    };
  }

  let rates = new Map<string, number>();
  let errors = new Map<string, number>();
  let p95s = new Map<string, number>();

  try {
    const rateRes = await client.query(
      `sum by (service_name, server_address) (rate(tracelens_http_client_request_duration_seconds_count[15m]))`,
    );
    rates = vectorPairs(rateRes, "service_name", "server_address");

    const errRes = await client.query(
      `sum by (service_name, server_address) (rate(tracelens_http_client_request_duration_seconds_count{http_response_status_code=~"5.."}[15m])) / clamp_min(sum by (service_name, server_address) (rate(tracelens_http_client_request_duration_seconds_count[15m])), 1e-9)`,
    );
    errors = vectorPairs(errRes, "service_name", "server_address");

    const p95Res = await client.query(
      `histogram_quantile(0.95, sum by (service_name, server_address, le) (rate(tracelens_http_client_request_duration_seconds_bucket[15m])))`,
    );
    // client histogram is in seconds
    for (const [k, v] of vectorPairs(p95Res, "service_name", "server_address")) {
      p95s.set(k, v * 1000);
    }
  } catch {
    // fall through to fallback edges
  }

  const edgeIds = new Set<string>([
    ...rates.keys(),
    ...errors.keys(),
    ...p95s.keys(),
  ]);

  let edges: ServiceMapEdge[];
  if (edgeIds.size === 0) {
    edges = FALLBACK_EDGES.map(([source, target]) => ({
      id: edgeKey(source, target),
      source,
      target,
      requestsPerSecond: null,
      errorRate: null,
      p95LatencyMs: null,
    }));
  } else {
    edges = [...edgeIds]
      .map((id) => {
        const [source, target] = id.split("->") as [string, string];
        const requestsPerSecond = rates.has(id) ? rates.get(id)! : null;
        const errorRate = errors.has(id) ? errors.get(id)! : null;
        const p95LatencyMs = p95s.has(id) ? p95s.get(id)! : null;
        return {
          id,
          source,
          target,
          requestsPerSecond,
          errorRate,
          p95LatencyMs,
        };
      })
      .filter((e) => e.source !== e.target)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  const names = new Set<string>([
    ...DEMO_SERVICES,
    ...edges.flatMap((e) => [e.source, e.target]),
    ...nodeByName.keys(),
  ]);

  // Drop pure platform noise unless it appears as an edge endpoint to a demo service
  const nodes: ServiceMapNode[] = [...names]
    .filter((id) => !IGNORE_TARGETS.has(id))
    .filter((id) => {
      if ((DEMO_SERVICES as readonly string[]).includes(id)) return true;
      return edges.some((e) => e.source === id || e.target === id);
    })
    .sort()
    .map((id) => {
      const svc = nodeByName.get(id);
      return {
        id,
        health: svc?.health ?? "unknown",
        requestsPerSecond: svc?.requestsPerSecond ?? null,
        errorRate: svc?.errorRate ?? null,
        p95LatencyMs: svc?.p95LatencyMs ?? null,
      };
    });

  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    backend: overview.backend,
  };
}
