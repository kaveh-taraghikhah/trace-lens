import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { EvaluateAllClient } from "@/components/EvaluateAllClient";
import { fetchAlertRules, fetchAlertSummary } from "@/lib/api";
import type { AlertStateStatus } from "@/lib/alerts";

export const dynamic = "force-dynamic";

function statusClass(status: AlertStateStatus | "disabled"): string {
  if (status === "firing") return "text-critical";
  if (status === "pending") return "text-degraded";
  if (status === "disabled") return "text-ink/40";
  return "text-healthy";
}

function worstStatus(
  enabled: boolean,
  states: { status: AlertStateStatus }[],
): AlertStateStatus | "disabled" {
  if (!enabled) return "disabled";
  if (states.some((s) => s.status === "firing")) return "firing";
  if (states.some((s) => s.status === "pending")) return "pending";
  return "ok";
}

function thresholdLabel(metricType: string, threshold: number): string {
  if (metricType === "error_rate" || metricType === "request_rate_drop") {
    return `${(threshold * 100).toFixed(1)}%`;
  }
  if (metricType === "p95_latency") return `${threshold}ms`;
  return String(threshold);
}

export default async function AlertsPage() {
  const [list, summary] = await Promise.all([
    fetchAlertRules(),
    fetchAlertSummary(),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <AppHeader
        active="alerts"
        subtitle="Prometheus rules; firing opens an incident after the FOR window."
      />

      {(list.error ?? summary.error) && (
        <div className="mb-6 border border-critical/40 bg-critical/10 px-4 py-3 font-mono text-sm text-critical">
          ⚠ {list.error ?? summary.error}
        </div>
      )}

      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Rules" value={summary.rules} />
        <Stat label="Enabled" value={summary.enabled} />
        <Stat label="Pending" value={summary.pending} tone="degraded" />
        <Stat label="Firing" value={summary.firing} tone="critical" />
        <Stat
          label="Open incidents"
          value={summary.openIncidents}
          tone="critical"
        />
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Alert rules</h1>
        <Link
          href="/alerts/new"
          className="bg-accent px-4 py-2 font-mono text-sm text-paper hover:opacity-90"
        >
          New rule
        </Link>
      </div>

      <div className="mb-4">
        <EvaluateAllClient />
      </div>

      <div className="overflow-x-auto border border-[var(--line)] bg-paper/70">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--line)] font-mono text-xs uppercase tracking-wider text-ink/50">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Condition</th>
              <th className="px-4 py-3 font-medium">For</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {list.rules.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 font-mono text-sm text-ink/50"
                >
                  No alert rules yet. Create one or run migrations to load seeds.
                </td>
              </tr>
            ) : (
              list.rules.map((rule) => {
                const state = worstStatus(rule.enabled, rule.states);
                const sample = rule.states[0];
                return (
                  <tr
                    key={rule.id}
                    className="border-b border-[var(--line)] last:border-0 hover:bg-mist/30"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/alerts/${rule.id}`}
                        className="font-mono text-sm text-accent hover:underline"
                      >
                        {rule.name}
                      </Link>
                      <p className="mt-1 font-mono text-xs text-ink/45">
                        {rule.service ?? "all services"}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {rule.metricType} {rule.comparator}{" "}
                      {thresholdLabel(rule.metricType, rule.threshold)}
                      <span className="text-ink/40">
                        {" "}
                        / {rule.windowSeconds}s
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {rule.forSeconds}s
                    </td>
                    <td className="px-4 py-3 font-mono text-xs uppercase">
                      {rule.severity}
                    </td>
                    <td
                      className={`px-4 py-3 font-mono text-xs uppercase ${statusClass(state)}`}
                    >
                      {state}
                      {sample?.lastValueFormatted && (
                        <span className="mt-1 block normal-case text-ink/45">
                          last {sample.lastValueFormatted}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "critical" | "degraded";
}) {
  const color =
    tone === "critical"
      ? "text-critical"
      : tone === "degraded"
        ? "text-degraded"
        : "text-ink";
  return (
    <div className="border border-[var(--line)] bg-paper/60 px-4 py-4">
      <p className="font-mono text-xs uppercase tracking-wider text-ink/45">
        {label}
      </p>
      <p className={`mt-1 font-display text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
