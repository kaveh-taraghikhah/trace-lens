import type {
  LogSearchResult,
  ServiceMap,
  ServicesOverview,
  TraceDetail,
  TraceSearchResult,
} from "@tracelens/types";
import type {
  AlertRuleView,
  AlertsListResponse,
  AlertsSummary,
} from "./alerts";
import type {
  IncidentInvestigation,
  IncidentsListResponse,
  IncidentsSummary,
} from "./incidents";

const API_URL = process.env.TRACELENS_API_URL ?? "http://localhost:4000";

const AUTH_SSR_MESSAGE =
  "API unauthorized. Set TRACELENS_API_KEY for SSR when TRACELENS_AUTH_MODE=api_key.";

/** Server-side auth for SSR when API runs with TRACELENS_AUTH_MODE=api_key. */
function serverAuthHeaders(): HeadersInit {
  const key = process.env.TRACELENS_API_KEY?.trim();
  if (!key) return {};
  return { "x-api-key": key };
}

function applyAuthFailure<T>(fallback: T): T {
  if (!fallback || typeof fallback !== "object") return fallback;
  const obj = fallback as Record<string, unknown>;
  if (obj.backend && typeof obj.backend === "object" && obj.backend !== null) {
    return {
      ...fallback,
      backend: {
        ...(obj.backend as Record<string, unknown>),
        message: AUTH_SSR_MESSAGE,
      },
    };
  }
  return { ...fallback, error: AUTH_SSR_MESSAGE };
}

async function apiFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      headers: serverAuthHeaders(),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return applyAuthFailure(fallback);
      }
      throw new Error(`API ${res.status}`);
    }
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export async function fetchServicesOverview(): Promise<ServicesOverview> {
  return apiFetch("/api/services", {
    services: [],
    summary: { healthy: 0, degraded: 0, critical: 0, unknown: 0 },
    generatedAt: new Date().toISOString(),
    backend: {
      prometheus: "unavailable",
      message: "Metrics backend temporarily unavailable.",
    },
  });
}

export async function fetchTraces(params: {
  service?: string;
  minDuration?: string;
  status?: string;
}): Promise<TraceSearchResult> {
  const qs = new URLSearchParams();
  if (params.service) qs.set("service", params.service);
  if (params.minDuration) qs.set("minDuration", params.minDuration);
  if (params.status) qs.set("status", params.status);
  const q = qs.toString();
  return apiFetch(`/api/traces${q ? `?${q}` : ""}`, {
    traces: [],
    generatedAt: new Date().toISOString(),
    backend: {
      tempo: "unavailable",
      message: "Traces backend temporarily unavailable.",
    },
  });
}

export async function fetchTrace(traceId: string): Promise<TraceDetail> {
  return apiFetch(`/api/traces/${traceId}`, {
    traceId,
    rootServiceName: "unknown",
    rootOperation: "unknown",
    durationMs: 0,
    startTimeUnixNano: "0",
    spans: [],
    generatedAt: new Date().toISOString(),
    backend: {
      tempo: "unavailable",
      message: "Traces backend temporarily unavailable.",
    },
  });
}

export async function fetchLogs(params: {
  service?: string;
  level?: string;
  traceId?: string;
  q?: string;
  range?: string;
}): Promise<LogSearchResult> {
  const qs = new URLSearchParams();
  if (params.service) qs.set("service", params.service);
  if (params.level) qs.set("level", params.level);
  if (params.traceId) qs.set("traceId", params.traceId);
  if (params.q) qs.set("q", params.q);
  if (params.range) qs.set("range", params.range);
  const q = qs.toString();
  return apiFetch(`/api/logs${q ? `?${q}` : ""}`, {
    logs: [],
    generatedAt: new Date().toISOString(),
    backend: {
      loki: "unavailable",
      message: "Logs backend temporarily unavailable.",
    },
  });
}

export async function fetchServiceMap(): Promise<ServiceMap> {
  return apiFetch("/api/services/map", {
    nodes: [],
    edges: [],
    generatedAt: new Date().toISOString(),
    backend: {
      prometheus: "unavailable",
      message: "Metrics backend temporarily unavailable.",
    },
  });
}

export async function fetchAlertRules(): Promise<AlertsListResponse> {
  return apiFetch("/api/alerts/rules", {
    rules: [],
    generatedAt: new Date().toISOString(),
  });
}

export async function fetchAlertSummary(): Promise<AlertsSummary> {
  return apiFetch("/api/alerts/summary", {
    rules: 0,
    enabled: 0,
    firing: 0,
    pending: 0,
    openIncidents: 0,
  });
}

export async function fetchAlertRule(id: string): Promise<AlertRuleView | null> {
  try {
    const res = await fetch(`${API_URL}/api/alerts/rules/${id}`, {
      cache: "no-store",
      headers: serverAuthHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as AlertRuleView;
  } catch {
    return null;
  }
}

export async function fetchIncidents(
  status: "active" | "open" | "acknowledged" | "resolved" = "active",
): Promise<IncidentsListResponse> {
  return apiFetch(`/api/incidents?status=${status}`, {
    incidents: [],
    generatedAt: new Date().toISOString(),
  });
}

export async function fetchIncidentsSummary(): Promise<IncidentsSummary> {
  return apiFetch("/api/incidents/summary", {
    open: 0,
    acknowledged: 0,
    resolved: 0,
    critical: 0,
  });
}

export async function fetchIncident(
  id: string,
): Promise<IncidentInvestigation | null> {
  try {
    const res = await fetch(`${API_URL}/api/incidents/${id}`, {
      cache: "no-store",
      headers: serverAuthHeaders(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as IncidentInvestigation;
  } catch {
    return null;
  }
}
