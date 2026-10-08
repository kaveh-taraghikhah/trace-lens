import {
  AlertRepository,
  AFFECTED_ENDPOINTS,
  IncidentRepository,
  type IncidentDetailRow,
} from "@tracelens/database";
import type { LogEntry, TraceSummary } from "@tracelens/types";
import { getServicesOverview } from "../adapters/prometheus/services.js";
import { searchLogs } from "../adapters/loki/logs.js";
import { searchTraces } from "../adapters/tempo/traces.js";

export interface IncidentInvestigation {
  incident: IncidentDetailRow;
  alertRule: {
    id: string;
    name: string;
    metricType: string;
    threshold: number;
    forSeconds: number;
    severity: string;
  } | null;
  events: Awaited<ReturnType<IncidentRepository["listEvents"]>>;
  impact: {
    service: string;
    affectedEndpoint: string | null;
    errorRate: number | null;
    p95LatencyMs: number | null;
    requestsPerSecond: number | null;
    health: string;
  };
  related: {
    traces: TraceSummary[];
    logs: LogEntry[];
    deployments: Awaited<
      ReturnType<IncidentRepository["listDeploymentsNear"]>
    >;
  };
  links: {
    traces: string;
    logs: string;
    alertRule: string | null;
    serviceMap: string;
  };
  backends: {
    prometheus: string;
    tempo: string;
    loki: string;
  };
  generatedAt: string;
}

export async function enrichIncident(
  incident: IncidentDetailRow,
  deps: {
    incidents: IncidentRepository;
    alerts: AlertRepository;
    prometheusUrl: string;
    tempoUrl: string;
    lokiUrl: string;
  },
): Promise<IncidentInvestigation> {
  const { incidents, alerts, prometheusUrl, tempoUrl, lokiUrl } = deps;

  // Fill missing endpoint in the response only — do not persist on read paths.
  if (!incident.affectedEndpoint) {
    const endpoint = AFFECTED_ENDPOINTS[incident.service] ?? null;
    if (endpoint) {
      incident = { ...incident, affectedEndpoint: endpoint };
    }
  }

  const [events, rule, overview, tracesResult, logsResult, deployments] =
    await Promise.all([
      incidents.listEvents(incident.id),
      alerts.getRule(incident.alertRuleId),
      getServicesOverview(prometheusUrl).catch(() => null),
      searchTraces(tempoUrl, {
        service: incident.service,
        status: "error",
        limit: 8,
      }).catch(() => null),
      searchLogs(lokiUrl, {
        service: incident.service,
        level: "error",
        range: "1h",
        limit: 12,
      }).catch(() => null),
      incidents.listDeploymentsNear({
        projectId: incident.projectId,
        service: incident.service,
        around: new Date(incident.startedAt),
        beforeHours: 6,
        afterHours: 1,
      }),
    ]);

  const svc = overview?.services.find((s) => s.name === incident.service);
  const errorRate = svc?.errorRate ?? null;
  const p95LatencyMs = svc?.p95LatencyMs ?? null;
  const requestsPerSecond = svc?.requestsPerSecond ?? null;
  const health = svc?.health ?? "unknown";

  const summaryParts = [
    `${incident.service} ${incident.severity}`,
    errorRate !== null ? `error ${(errorRate * 100).toFixed(1)}%` : null,
    p95LatencyMs !== null ? `p95 ${Math.round(p95LatencyMs)}ms` : null,
    incident.affectedEndpoint ? `endpoint ${incident.affectedEndpoint}` : null,
  ].filter(Boolean);
  // Live summary for the investigation payload only — GET must not rewrite stored text.
  const summary = summaryParts.join(" · ");
  if (summary && summary !== incident.summary) {
    incident = { ...incident, summary };
  }

  return {
    incident,
    alertRule: rule
      ? {
          id: rule.id,
          name: rule.name,
          metricType: rule.metricType,
          threshold: rule.threshold,
          forSeconds: rule.forSeconds,
          severity: rule.severity,
        }
      : null,
    events,
    impact: {
      service: incident.service,
      affectedEndpoint: incident.affectedEndpoint,
      errorRate,
      p95LatencyMs,
      requestsPerSecond,
      health,
    },
    related: {
      traces: tracesResult?.traces ?? [],
      logs: logsResult?.logs ?? [],
      deployments,
    },
    links: {
      traces: `/traces?service=${encodeURIComponent(incident.service)}&status=error`,
      logs: `/logs?service=${encodeURIComponent(incident.service)}&level=error`,
      alertRule: rule ? `/alerts/${rule.id}` : null,
      serviceMap: "/services/map",
    },
    backends: {
      prometheus: overview?.backend?.prometheus ?? "unavailable",
      tempo: tracesResult?.backend?.tempo ?? "unavailable",
      loki: logsResult?.backend?.loki ?? "unavailable",
    },
    generatedAt: new Date().toISOString(),
  };
}
