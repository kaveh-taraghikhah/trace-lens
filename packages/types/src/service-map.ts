import type { ServiceHealth } from "./services.js";

export interface ServiceMapNode {
  id: string;
  health: ServiceHealth;
  requestsPerSecond: number | null;
  errorRate: number | null;
  p95LatencyMs: number | null;
}

export interface ServiceMapEdge {
  id: string;
  source: string;
  target: string;
  requestsPerSecond: number | null;
  errorRate: number | null;
  p95LatencyMs: number | null;
}

export interface ServiceMap {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
  generatedAt: string;
  backend: {
    prometheus: "ok" | "unavailable";
    message?: string;
  };
}
