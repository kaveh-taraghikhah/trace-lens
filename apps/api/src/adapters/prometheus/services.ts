import {
  DEMO_SERVICES,
  type ServiceHealth,
  type ServiceRedMetrics,
  type ServicesOverview,
} from "@tracelens/types";
import {
  PrometheusClient,
  vectorByLabel,
} from "./client.js";

/**
 * OTel → Collector prometheus exporter (namespace tracelens) typically emits
 * http.server.duration as a histogram. Label names vary slightly by semconv;
 * we try a few PromQL shapes and merge.
 */
const RATE_QUERIES = [
  `sum by (service_name) (rate(tracelens_http_server_duration_milliseconds_count[5m]))`,
  `sum by (service_name) (rate(tracelens_http_server_request_duration_seconds_count[5m]))`,
  `sum by (job) (rate(tracelens_http_server_duration_milliseconds_count[5m]))`,
];

const ERROR_RATE_QUERIES = [
  `sum by (service_name) (rate(tracelens_http_server_duration_milliseconds_count{http_status_code=~"5.."}[5m])) / clamp_min(sum by (service_name) (rate(tracelens_http_server_duration_milliseconds_count[5m])), 1e-9)`,
  `sum by (service_name) (rate(tracelens_http_server_duration_milliseconds_count{http_response_status_code=~"5.."}[5m])) / clamp_min(sum by (service_name) (rate(tracelens_http_server_duration_milliseconds_count[5m])), 1e-9)`,
];

const P95_QUERIES = [
  `histogram_quantile(0.95, sum by (service_name, le) (rate(tracelens_http_server_duration_milliseconds_bucket[5m])))`,
  `histogram_quantile(0.95, sum by (service_name, le) (rate(tracelens_http_server_request_duration_seconds_bucket[5m]))) * 1000`,
];

function classifyHealth(
  errorRate: number | null,
  p95Ms: number | null,
  requestsPerSecond: number | null,
): ServiceHealth {
  if (
    errorRate === null &&
    p95Ms === null &&
    (requestsPerSecond === null || requestsPerSecond === 0)
  ) {
    return "unknown";
  }
  if ((errorRate ?? 0) >= 0.05 || (p95Ms ?? 0) >= 1000) return "critical";
  if ((errorRate ?? 0) >= 0.02 || (p95Ms ?? 0) >= 500) return "degraded";
  return "healthy";
}

async function firstNonEmpty(
  client: PrometheusClient,
  queries: string[],
  labelCandidates: string[],
): Promise<Map<string, number>> {
  for (const q of queries) {
    try {
      const result = await client.query(q);
      for (const label of labelCandidates) {
        const map = vectorByLabel(result, label);
        if (map.size > 0) return map;
      }
    } catch {
      // try next query shape
    }
  }
  return new Map();
}

export async function getServicesOverview(
  prometheusUrl: string,
): Promise<ServicesOverview> {
  const client = new PrometheusClient(prometheusUrl);
  const ready = await client.ready();

  if (!ready) {
    return {
      services: DEMO_SERVICES.map((name) => ({
        name,
        requestsPerSecond: null,
        errorRate: null,
        p95LatencyMs: null,
        health: "unknown" as const,
      })),
      summary: { healthy: 0, degraded: 0, critical: 0, unknown: DEMO_SERVICES.length },
      generatedAt: new Date().toISOString(),
      backend: {
        prometheus: "unavailable",
        message: "Metrics backend temporarily unavailable.",
      },
    };
  }

  const labels = ["service_name", "service", "job"];

  const [rates, errors, p95s] = await Promise.all([
    firstNonEmpty(client, RATE_QUERIES, labels),
    firstNonEmpty(client, ERROR_RATE_QUERIES, labels),
    firstNonEmpty(client, P95_QUERIES, labels),
  ]);

  const names = new Set<string>([
    ...DEMO_SERVICES,
    ...rates.keys(),
    ...errors.keys(),
    ...p95s.keys(),
  ]);

  // Drop collector/internal jobs that aren't app services
  const ignore = new Set(["otel-collector", "prometheus", "grafana", "tempo", "loki"]);

  const services: ServiceRedMetrics[] = [...names]
    .filter((n) => !ignore.has(n))
    .sort()
    .map((name) => {
      const requestsPerSecond = rates.has(name) ? rates.get(name)! : null;
      const errorRate = errors.has(name) ? errors.get(name)! : null;
      const p95LatencyMs = p95s.has(name) ? p95s.get(name)! : null;
      return {
        name,
        requestsPerSecond,
        errorRate,
        p95LatencyMs,
        health: classifyHealth(errorRate, p95LatencyMs, requestsPerSecond),
      };
    });

  const summary = {
    healthy: services.filter((s) => s.health === "healthy").length,
    degraded: services.filter((s) => s.health === "degraded").length,
    critical: services.filter((s) => s.health === "critical").length,
    unknown: services.filter((s) => s.health === "unknown").length,
  };

  return {
    services,
    summary,
    generatedAt: new Date().toISOString(),
    backend: { prometheus: "ok" },
  };
}
