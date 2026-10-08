export type IncidentStatus = "open" | "acknowledged" | "resolved";
export type IncidentSeverity = "info" | "warning" | "critical";

export interface IncidentListItem {
  id: string;
  projectId: string;
  alertRuleId: string;
  fingerprint: string;
  title: string;
  service: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  notes: string;
  affectedEndpoint: string | null;
  summary: string;
}

export interface IncidentEventView {
  id: string;
  incidentId: string;
  kind: string;
  message: string;
  actor: string | null;
  createdAt: string;
}

export interface DeploymentView {
  id: string;
  projectId: string;
  service: string;
  version: string;
  environment: string;
  deployedAt: string;
  metadata: Record<string, unknown>;
}

export interface IncidentInvestigation {
  incident: IncidentListItem;
  alertRule: {
    id: string;
    name: string;
    metricType: string;
    threshold: number;
    forSeconds: number;
    severity: string;
  } | null;
  events: IncidentEventView[];
  impact: {
    service: string;
    affectedEndpoint: string | null;
    errorRate: number | null;
    p95LatencyMs: number | null;
    requestsPerSecond: number | null;
    health: string;
  };
  related: {
    traces: Array<{
      traceId: string;
      rootServiceName: string;
      rootTraceName: string;
      startTimeUnixNano: string;
      durationMs: number;
    }>;
    logs: Array<{
      timestamp: string;
      service: string;
      level: string;
      message: string;
      traceId?: string;
    }>;
    deployments: DeploymentView[];
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

export interface IncidentsListResponse {
  incidents: IncidentListItem[];
  generatedAt: string;
  /** Present when SSR could not authenticate to the API. */
  error?: string;
}

export interface IncidentsSummary {
  open: number;
  acknowledged: number;
  resolved: number;
  critical: number;
  error?: string;
}
