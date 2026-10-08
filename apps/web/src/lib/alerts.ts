export type AlertMetricType =
  | "error_rate"
  | "p95_latency"
  | "request_rate"
  | "request_rate_drop";

export type AlertStateStatus = "ok" | "pending" | "firing";

export interface AlertStateView {
  alertRuleId: string;
  service: string;
  status: AlertStateStatus;
  pendingSince: string | null;
  firingSince: string | null;
  lastValue: number | null;
  lastValueFormatted: string | null;
  lastEvaluatedAt: string | null;
  lastError: string | null;
  openIncidentId: string | null;
}

export interface AlertRuleView {
  id: string;
  projectId: string;
  name: string;
  description: string;
  metricType: AlertMetricType;
  service: string | null;
  comparator: "gt" | "lt";
  threshold: number;
  windowSeconds: number;
  forSeconds: number;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  promql: string;
  states: AlertStateView[];
}

export interface AlertsListResponse {
  rules: AlertRuleView[];
  generatedAt: string;
  /** Present when SSR could not authenticate to the API. */
  error?: string;
}

export interface AlertsSummary {
  rules: number;
  enabled: number;
  firing: number;
  pending: number;
  openIncidents: number;
  error?: string;
}
