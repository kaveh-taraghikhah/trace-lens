import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AlertActions } from "@/components/AlertActions";
import { EditAlertForm } from "@/components/EditAlertForm";
import { fetchAlertRule } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rule = await fetchAlertRule(id);
  if (!rule) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <AppHeader
        active="alerts"
        subtitle="Rule state, generated PromQL, linked incidents."
      />

      <Link
        href="/alerts"
        className="mb-6 inline-block font-mono text-sm text-accent hover:underline"
      >
        ← Back to alerts
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">{rule.name}</h1>
          <p className="mt-2 max-w-2xl font-mono text-sm text-ink/60">
            {rule.description || "No description"}
          </p>
        </div>
        <AlertActions ruleId={rule.id} enabled={rule.enabled} />
      </div>

      <div className="mb-8">
        <EditAlertForm rule={rule} />
      </div>

      <section className="mb-8 grid gap-4 md:grid-cols-2">
        <Info
          label="Condition"
          value={`${rule.metricType} ${rule.comparator} ${rule.threshold} over ${rule.windowSeconds}s`}
        />
        <Info label="For" value={`${rule.forSeconds}s before firing`} />
        <Info label="Service" value={rule.service ?? "all services"} />
        <Info
          label="Severity / Enabled"
          value={`${rule.severity} · ${rule.enabled ? "enabled" : "disabled"}`}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-display text-xl font-bold">PromQL</h2>
        <pre className="overflow-x-auto border border-[var(--line)] bg-ink px-4 py-3 font-mono text-xs text-paper">
          {rule.promql}
        </pre>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold">Evaluation state</h2>
        <div className="overflow-x-auto border border-[var(--line)] bg-paper/70">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--line)] font-mono text-xs uppercase tracking-wider text-ink/50">
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last value</th>
                <th className="px-4 py-3 font-medium">Evaluated</th>
                <th className="px-4 py-3 font-medium">Incident</th>
              </tr>
            </thead>
            <tbody>
              {rule.states.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 font-mono text-sm text-ink/50"
                  >
                    Not evaluated yet. Click Evaluate now.
                  </td>
                </tr>
              ) : (
                rule.states.map((s) => (
                  <tr
                    key={`${s.alertRuleId}-${s.service}`}
                    className="border-b border-[var(--line)] last:border-0"
                  >
                    <td className="px-4 py-3 font-mono text-sm">{s.service}</td>
                    <td className="px-4 py-3 font-mono text-xs uppercase">
                      {s.status}
                      {s.lastError && (
                        <span className="mt-1 block normal-case text-critical">
                          {s.lastError}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {s.lastValueFormatted ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink/50">
                      {s.lastEvaluatedAt
                        ? new Date(s.lastEvaluatedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {s.openIncidentId ? (
                        <span className="text-critical">
                          {s.openIncidentId.slice(0, 8)}…
                        </span>
                      ) : (
                        "—"
                      )}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--line)] bg-paper/60 px-4 py-4">
      <p className="font-mono text-xs uppercase tracking-wider text-ink/45">
        {label}
      </p>
      <p className="mt-2 font-mono text-sm">{value}</p>
    </div>
  );
}
