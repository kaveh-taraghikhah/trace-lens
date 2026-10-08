export type ServiceHealth = "healthy" | "degraded" | "critical" | "unknown";

export interface ServiceRedMetrics {
  name: string;
  requestsPerSecond: number | null;
  errorRate: number | null;
  p95LatencyMs: number | null;
  health: ServiceHealth;
}

export interface ServicesOverview {
  services: ServiceRedMetrics[];
  summary: {
    healthy: number;
    degraded: number;
    critical: number;
    unknown: number;
  };
  generatedAt: string;
  backend: {
    prometheus: "ok" | "unavailable";
    message?: string;
  };
}

export const KNOWN_DEMO_SERVICES = [
  "shop-api",
  "product-api",
  "order-api",
  "payment-api",
  "notification-worker",
] as const;
