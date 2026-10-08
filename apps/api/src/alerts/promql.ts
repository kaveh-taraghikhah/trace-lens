import type { AlertComparator, AlertMetricType, AlertRule } from "@tracelens/database";

export interface MetricSample {
  service: string;
  value: number;
}

function windowExpr(seconds: number): string {
  // PromQL accepts second durations; keep the configured window exact.
  const s = Math.max(1, Math.floor(Number(seconds) || 0));
  return `${s}s`;
}

function escapePromLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function serviceSel(serviceFilter: string): string {
  return serviceFilter ? `{${serviceFilter}}` : "";
}

function statusSel(serviceFilter: string, statusLabel: string): string {
  return serviceFilter
    ? `{${serviceFilter},${statusLabel}=~"5.."}`
    : `{${statusLabel}=~"5.."}`;
}

/**
 * Candidate PromQL shapes aligned with the services dashboard adapter.
 * OTel HTTP instrumentation may emit milliseconds or seconds histograms and
 * either http_status_code or http_response_status_code labels.
 */
export function buildAlertPromqlCandidates(rule: AlertRule): string[] {
  const w = windowExpr(rule.windowSeconds);
  const serviceFilter = rule.service
    ? `service_name="${escapePromLabel(rule.service)}"`
    : "";
  const sel = serviceSel(serviceFilter);

  switch (rule.metricType) {
    case "error_rate": {
      const statusLabels = ["http_status_code", "http_response_status_code"];
      const metrics = [
        "tracelens_http_server_duration_milliseconds_count",
        "tracelens_http_server_request_duration_seconds_count",
      ];
      const queries: string[] = [];
      for (const metric of metrics) {
        for (const statusLabel of statusLabels) {
          const errSel = statusSel(serviceFilter, statusLabel);
          queries.push(
            `sum by (service_name) (rate(${metric}${errSel}[${w}])) / clamp_min(sum by (service_name) (rate(${metric}${sel}[${w}])), 1e-9)`,
          );
        }
      }
      return queries;
    }
    case "p95_latency": {
      return [
        `histogram_quantile(0.95, sum by (service_name, le) (rate(tracelens_http_server_duration_milliseconds_bucket${sel}[${w}])))`,
        // Convert seconds histogram to ms so thresholds stay in milliseconds.
        `histogram_quantile(0.95, sum by (service_name, le) (rate(tracelens_http_server_request_duration_seconds_bucket${sel}[${w}]))) * 1000`,
      ];
    }
    case "request_rate": {
      return [
        `sum by (service_name) (rate(tracelens_http_server_duration_milliseconds_count${sel}[${w}]))`,
        `sum by (service_name) (rate(tracelens_http_server_request_duration_seconds_count${sel}[${w}]))`,
      ];
    }
    case "request_rate_drop": {
      // Current rate as fraction of rate from one window ago; alert when ratio is low.
      return [
        `sum by (service_name) (rate(tracelens_http_server_duration_milliseconds_count${sel}[${w}])) / clamp_min(sum by (service_name) (rate(tracelens_http_server_duration_milliseconds_count${sel}[${w}] offset ${w})), 1e-9)`,
        `sum by (service_name) (rate(tracelens_http_server_request_duration_seconds_count${sel}[${w}])) / clamp_min(sum by (service_name) (rate(tracelens_http_server_request_duration_seconds_count${sel}[${w}] offset ${w})), 1e-9)`,
      ];
    }
    default: {
      const _exhaustive: never = rule.metricType;
      throw new Error(`Unsupported metric type: ${_exhaustive}`);
    }
  }
}

/**
 * Primary PromQL for display; evaluation tries all candidates via
 * {@link buildAlertPromqlCandidates}.
 */
export function buildAlertPromql(rule: AlertRule): string {
  return buildAlertPromqlCandidates(rule)[0]!;
}

export function compareValue(
  value: number,
  comparator: AlertComparator,
  threshold: number,
): boolean {
  if (!Number.isFinite(value)) return false;
  return comparator === "gt" ? value > threshold : value < threshold;
}

export function formatMetricValue(
  metricType: AlertMetricType,
  value: number,
): string {
  if (metricType === "error_rate" || metricType === "request_rate_drop") {
    return `${(value * 100).toFixed(2)}%`;
  }
  if (metricType === "p95_latency") {
    return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
  }
  return value.toFixed(3);
}

export function fingerprint(ruleId: string, service: string): string {
  return `${ruleId}:${service}`;
}
