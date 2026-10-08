import Link from "next/link";
import { fetchServicesOverview } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import {
  HealthDot,
  formatErrorRate,
  formatLatency,
  formatRate,
} from "@/components/metrics";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const overview = await fetchServicesOverview();
  const { summary, services, backend, generatedAt } = overview;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <AppHeader
        active="services"
        subtitle="RED metrics from Prometheus for each demo service."
      />

      {backend.prometheus === "unavailable" && (
        <div
          role="status"
          className="mb-6 border border-degraded/40 bg-degraded/10 px-4 py-3 font-mono text-sm text-degraded"
        >
          ⚠ {backend.message ?? "Metrics backend temporarily unavailable."} Logs
          and traces remain available in later views.
        </div>
      )}

      <section className="mb-10">
        <h1 className="mb-4 font-display text-2xl font-bold">Health</h1>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <HealthStat label="Healthy" value={summary.healthy} tone="healthy" />
          <HealthStat label="Degraded" value={summary.degraded} tone="degraded" />
          <HealthStat label="Critical" value={summary.critical} tone="critical" />
          <HealthStat label="Unknown" value={summary.unknown} tone="unknown" />
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl font-bold">Services</h2>
          <div className="flex items-center gap-4 font-mono text-xs text-ink/45">
            <Link href="/services/map" className="text-accent hover:underline">
              Service map →
            </Link>
            <span>updated {new Date(generatedAt).toLocaleTimeString()}</span>
          </div>
        </div>

        <div className="overflow-x-auto border border-[var(--line)] bg-paper/70 backdrop-blur-sm">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--line)] font-mono text-xs uppercase tracking-wider text-ink/50">
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Requests/s</th>
                <th className="px-4 py-3 font-medium">Error rate</th>
                <th className="px-4 py-3 font-medium">p95 latency</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {services.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 font-mono text-sm text-ink/50"
                  >
                    No service metrics yet. Generate traffic against the demo
                    shop API, then refresh.
                  </td>
                </tr>
              ) : (
                services.map((svc) => (
                  <tr
                    key={svc.name}
                    className="border-b border-[var(--line)] last:border-0 hover:bg-mist/30"
                  >
                    <td className="px-4 py-3 font-mono text-sm font-medium">
                      {svc.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {formatRate(svc.requestsPerSecond)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {formatErrorRate(svc.errorRate)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {formatLatency(svc.p95LatencyMs)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      <HealthDot health={svc.health} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function HealthStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "healthy" | "degraded" | "critical" | "unknown";
}) {
  const color =
    tone === "healthy"
      ? "text-healthy"
      : tone === "degraded"
        ? "text-degraded"
        : tone === "critical"
          ? "text-critical"
          : "text-ink/45";

  return (
    <div className="border border-[var(--line)] bg-paper/60 px-4 py-5">
      <p className="font-mono text-xs uppercase tracking-wider text-ink/45">
        {label}
      </p>
      <p className={`mt-2 font-display text-4xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
