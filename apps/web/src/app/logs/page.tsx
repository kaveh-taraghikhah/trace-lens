import Link from "next/link";
import { DEMO_SERVICES, type LogLevel } from "@tracelens/types";
import { AppHeader } from "@/components/AppHeader";
import { fetchLogs } from "@/lib/api";

export const dynamic = "force-dynamic";

const LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

function levelClass(level: LogLevel): string {
  if (level === "error" || level === "fatal") return "text-critical";
  if (level === "warn") return "text-degraded";
  return "text-ink/70";
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    service?: string;
    level?: string;
    traceId?: string;
    q?: string;
    range?: string;
  }>;
}) {
  const params = await searchParams;
  const result = await fetchLogs({
    service: params.service,
    level: params.level,
    traceId: params.traceId,
    q: params.q,
    range: params.range ?? "1h",
  });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <AppHeader
        active="logs"
        subtitle="Loki log search; jump to a trace when trace_id is present."
      />

      {result.backend.loki === "unavailable" && (
        <div
          role="status"
          className="mb-6 border border-degraded/40 bg-degraded/10 px-4 py-3 font-mono text-sm text-degraded"
        >
          ⚠ {result.backend.message ?? "Logs backend temporarily unavailable."}
        </div>
      )}

      {params.traceId && (
        <div className="mb-4 border border-[var(--line)] bg-mist/40 px-4 py-3 font-mono text-sm">
          Filtered by trace{" "}
          <Link
            href={`/traces/${params.traceId}`}
            className="text-accent hover:underline"
          >
            {params.traceId.slice(0, 16)}
          </Link>
          {" · "}
          <Link href="/logs" className="text-ink/50 hover:underline">
            clear
          </Link>
        </div>
      )}

      <form className="mb-6 flex flex-wrap items-end gap-3 border border-[var(--line)] bg-paper/60 p-4">
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wider text-ink/45">
          Service
          <select
            name="service"
            defaultValue={params.service ?? ""}
            className="min-w-[160px] border border-[var(--line)] bg-paper px-2 py-2 text-sm normal-case text-ink"
          >
            <option value="">All</option>
            {DEMO_SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wider text-ink/45">
          Level
          <select
            name="level"
            defaultValue={params.level ?? ""}
            className="min-w-[120px] border border-[var(--line)] bg-paper px-2 py-2 text-sm normal-case text-ink"
          >
            <option value="">Any</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wider text-ink/45">
          Range
          <select
            name="range"
            defaultValue={params.range ?? "1h"}
            className="min-w-[100px] border border-[var(--line)] bg-paper px-2 py-2 text-sm normal-case text-ink"
          >
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="6h">6h</option>
            <option value="24h">24h</option>
          </select>
        </label>
        <label className="flex min-w-[180px] flex-1 flex-col gap-1 font-mono text-xs uppercase tracking-wider text-ink/45">
          Search
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="timeout, payment…"
            className="border border-[var(--line)] bg-paper px-2 py-2 text-sm normal-case text-ink"
          />
        </label>
        <label className="flex min-w-[160px] flex-col gap-1 font-mono text-xs uppercase tracking-wider text-ink/45">
          Trace ID
          <input
            name="traceId"
            defaultValue={params.traceId ?? ""}
            placeholder="optional"
            className="border border-[var(--line)] bg-paper px-2 py-2 text-sm normal-case text-ink"
          />
        </label>
        <button
          type="submit"
          className="bg-accent px-4 py-2 font-mono text-sm text-paper hover:opacity-90"
        >
          Search
        </button>
      </form>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h1 className="font-display text-2xl font-bold">Logs</h1>
          <p className="font-mono text-xs text-ink/45">
            {result.logs.length} lines ·{" "}
            {new Date(result.generatedAt).toLocaleTimeString()}
          </p>
        </div>

        <div className="overflow-x-auto border border-[var(--line)] bg-paper/70">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--line)] font-mono text-xs uppercase tracking-wider text-ink/50">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Level</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Message</th>
                <th className="px-4 py-3 font-medium">Trace</th>
              </tr>
            </thead>
            <tbody>
              {result.logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 font-mono text-sm text-ink/50"
                  >
                    No logs matched. Generate demo traffic or widen filters.
                  </td>
                </tr>
              ) : (
                result.logs.map((log, i) => (
                  <tr
                    key={`${log.timestampNs}-${log.service}-${i}`}
                    className="border-b border-[var(--line)] last:border-0 hover:bg-mist/30"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-ink/60">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td
                      className={`px-4 py-2.5 font-mono text-xs uppercase ${levelClass(log.level)}`}
                    >
                      {log.level}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {log.service}
                    </td>
                    <td className="max-w-md truncate px-4 py-2.5 font-mono text-sm">
                      {log.message}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {log.traceId ? (
                        <Link
                          href={`/traces/${log.traceId}`}
                          className="text-accent hover:underline"
                        >
                          {log.traceId.slice(0, 12)}
                        </Link>
                      ) : (
                        <span className="text-ink/30">—</span>
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
