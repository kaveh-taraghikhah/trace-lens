import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { IncidentActions } from "@/components/IncidentActions";
import { fetchIncident } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchIncident(id);
  if (!data) notFound();

  const { incident, impact, related, links, events, alertRule, backends } =
    data;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 md:px-6">
      <AppHeader
        active="incidents"
        subtitle="Traces and logs pulled for this incident’s window."
      />

      <Link
        href="/incidents"
        className="mb-6 inline-block font-mono text-sm text-accent hover:underline"
      >
        ← Back to incidents
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-critical">
            Incident · {incident.severity} · {incident.status}
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold md:text-3xl">
            {incident.title}
          </h1>
          <p className="mt-2 font-mono text-sm text-ink/55">
            Started {new Date(incident.startedAt).toLocaleString()}
            {incident.acknowledgedBy
              ? ` · ack ${incident.acknowledgedBy}`
              : ""}
          </p>
        </div>
        <IncidentActions incidentId={incident.id} status={incident.status} />
      </div>

      <section className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Info label="Service" value={impact.service} />
        <Info
          label="Affected endpoint"
          value={impact.affectedEndpoint ?? "—"}
        />
        <Info
          label="Error rate"
          value={
            impact.errorRate === null
              ? "—"
              : `${(impact.errorRate * 100).toFixed(1)}%`
          }
        />
        <Info
          label="p95 / health"
          value={`${impact.p95LatencyMs !== null ? `${Math.round(impact.p95LatencyMs)}ms` : "—"} · ${impact.health}`}
        />
      </section>

      <section className="mb-8 flex flex-wrap gap-3 font-mono text-sm">
        <Jump href={links.traces}>Related traces</Jump>
        <Jump href={links.logs}>Related logs</Jump>
        {links.alertRule && <Jump href={links.alertRule}>Alert rule</Jump>}
        <Jump href={links.serviceMap}>Service map</Jump>
      </section>

      {(backends.prometheus !== "ok" ||
        backends.tempo !== "ok" ||
        backends.loki !== "ok") && (
        <p className="mb-6 border border-degraded/40 bg-degraded/10 px-4 py-3 font-mono text-xs text-degraded">
          Partial backends — prometheus:{backends.prometheus} tempo:
          {backends.tempo} loki:{backends.loki}. Investigation still available.
        </p>
      )}

      <div className="mb-10 grid gap-8 lg:grid-cols-2">
        <Panel title="Timeline">
          {events.length === 0 ? (
            <p className="font-mono text-sm text-ink/45">No events yet.</p>
          ) : (
            <ul className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="font-mono text-xs">
                  <span className="text-ink/40">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                  <span className="mx-2 uppercase text-accent">{e.kind}</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Deployments near start">
          {related.deployments.length === 0 ? (
            <p className="font-mono text-sm text-ink/45">
              No deployments in the correlation window.
            </p>
          ) : (
            <ul className="space-y-3">
              {related.deployments.map((d) => (
                <li key={d.id} className="font-mono text-sm">
                  <span className="text-accent">{d.service}</span>{" "}
                  <span className="font-bold">{d.version}</span>
                  <span className="mt-1 block text-xs text-ink/45">
                    {new Date(d.deployedAt).toLocaleString()} · {d.environment}
                    {typeof d.metadata.change === "string"
                      ? ` · ${d.metadata.change}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mb-10 grid gap-8 lg:grid-cols-2">
        <Panel title="Related error traces">
          {related.traces.length === 0 ? (
            <p className="font-mono text-sm text-ink/45">No error traces found.</p>
          ) : (
            <ul className="space-y-2">
              {related.traces.map((t) => (
                <li key={t.traceId}>
                  <Link
                    href={`/traces/${t.traceId}`}
                    className="font-mono text-sm text-accent hover:underline"
                  >
                    {t.traceId.slice(0, 16)}…
                  </Link>
                  <span className="ml-2 font-mono text-xs text-ink/45">
                    {t.rootServiceName} · {Math.round(t.durationMs)}ms ·{" "}
                    {t.rootTraceName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Related error logs">
          {related.logs.length === 0 ? (
            <p className="font-mono text-sm text-ink/45">No error logs found.</p>
          ) : (
            <ul className="space-y-2">
              {related.logs.map((l, i) => (
                <li key={`${l.timestamp}-${i}`} className="font-mono text-xs">
                  <span className="text-ink/40">
                    {new Date(l.timestamp).toLocaleTimeString()}
                  </span>{" "}
                  <span className="uppercase text-critical">{l.level}</span>{" "}
                  {l.message.slice(0, 120)}
                  {l.traceId && (
                    <>
                      {" "}
                      <Link
                        href={`/traces/${l.traceId}`}
                        className="text-accent hover:underline"
                      >
                        trace
                      </Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {alertRule && (
        <Panel title="Triggering alert">
          <p className="font-mono text-sm">
            <Link
              href={`/alerts/${alertRule.id}`}
              className="text-accent hover:underline"
            >
              {alertRule.name}
            </Link>
            <span className="text-ink/50">
              {" "}
              · {alertRule.metricType} · for {alertRule.forSeconds}s ·{" "}
              {alertRule.severity}
            </span>
          </p>
        </Panel>
      )}
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

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--line)] bg-paper/70 p-5">
      <h2 className="mb-3 font-display text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Jump({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="border border-[var(--line)] px-3 py-1.5 hover:bg-mist/40"
    >
      {children}
    </Link>
  );
}
