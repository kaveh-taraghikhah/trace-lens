import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { SimulateIncidentButton } from "@/components/SimulateIncidentButton";
import { fetchIncidents, fetchIncidentsSummary } from "@/lib/api";
import type { IncidentStatus } from "@/lib/incidents";

export const dynamic = "force-dynamic";

function statusClass(status: IncidentStatus): string {
  if (status === "open") return "text-critical";
  if (status === "acknowledged") return "text-degraded";
  return "text-healthy";
}

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter =
    sp.status === "resolved" ||
    sp.status === "open" ||
    sp.status === "acknowledged"
      ? sp.status
      : "active";

  const [list, summary] = await Promise.all([
    fetchIncidents(statusFilter),
    fetchIncidentsSummary(),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <AppHeader
        active="incidents"
        subtitle="Open incidents from fired alerts."
      />

      {(list.error ?? summary.error) && (
        <div className="mb-6 border border-critical/40 bg-critical/10 px-4 py-3 font-mono text-sm text-critical">
          ⚠ {list.error ?? summary.error}
        </div>
      )}

      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open" value={summary.open} tone="critical" />
        <Stat label="Acknowledged" value={summary.acknowledged} tone="degraded" />
        <Stat label="Critical active" value={summary.critical} tone="critical" />
        <Stat label="Resolved" value={summary.resolved} />
      </section>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold">Incidents</h1>
        <SimulateIncidentButton />
      </div>

      <div className="mb-4 flex flex-wrap gap-3 font-mono text-xs">
        {(
          [
            ["active", "Active"],
            ["open", "Open"],
            ["acknowledged", "Acknowledged"],
            ["resolved", "Resolved"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={key === "active" ? "/incidents" : `/incidents?status=${key}`}
            className={
              statusFilter === key
                ? "text-accent underline"
                : "text-ink/50 hover:text-ink"
            }
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto border border-[var(--line)] bg-paper/70">
        <table className="w-full min-w-[880px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--line)] font-mono text-xs uppercase tracking-wider text-ink/50">
              <th className="px-4 py-3 font-medium">Incident</th>
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Started</th>
            </tr>
          </thead>
          <tbody>
            {list.incidents.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 font-mono text-sm text-ink/50"
                >
                  No incidents. Simulate a payment failure, wait for an alert to
                  fire, then investigate here.
                </td>
              </tr>
            ) : (
              list.incidents.map((inc) => (
                <tr
                  key={inc.id}
                  className="border-b border-[var(--line)] last:border-0 hover:bg-mist/30"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/incidents/${inc.id}`}
                      className="font-mono text-sm text-accent hover:underline"
                    >
                      {inc.title}
                    </Link>
                    {inc.summary && (
                      <p className="mt-1 font-mono text-xs text-ink/45">
                        {inc.summary}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {inc.service}
                    {inc.affectedEndpoint && (
                      <span className="mt-1 block text-ink/40">
                        {inc.affectedEndpoint}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs uppercase">
                    {inc.severity}
                  </td>
                  <td
                    className={`px-4 py-3 font-mono text-xs uppercase ${statusClass(inc.status)}`}
                  >
                    {inc.status}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink/50">
                    {new Date(inc.startedAt).toLocaleString()}
                  </td>
                </tr>
              ))
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
