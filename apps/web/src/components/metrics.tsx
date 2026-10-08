import type { ServiceHealth } from "@tracelens/types";

const healthClass: Record<ServiceHealth, string> = {
  healthy: "text-healthy",
  degraded: "text-degraded",
  critical: "text-critical",
  unknown: "text-ink/50",
};

export function HealthDot({ health }: { health: ServiceHealth }) {
  const bg =
    health === "healthy"
      ? "bg-healthy"
      : health === "degraded"
        ? "bg-degraded"
        : health === "critical"
          ? "bg-critical"
          : "bg-ink/30";

  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${bg}`} />
      <span className={`capitalize ${healthClass[health]}`}>{health}</span>
    </span>
  );
}

export function formatRate(value: number | null): string {
  if (value === null) return "—";
  if (value < 0.01) return value.toFixed(3);
  if (value < 10) return value.toFixed(2);
  return value.toFixed(1);
}

export function formatErrorRate(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}
