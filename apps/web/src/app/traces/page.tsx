import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { fetchTraces } from "@/lib/api";
import { DEMO_SERVICES } from "@tracelens/types";

export const dynamic = "force-dynamic";

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

export default async function TracesPage({
  searchParams,
}: {
  searchParams: Promise<{
    service?: string;
    minDuration?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const result = await fetchTraces({
    service: params.service,
    minDuration: params.minDuration,
    status: params.status,
  });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <AppHeader
        active="traces"
        subtitle="Search Tempo, then open a trace waterfall."
      />

      {result.backend.tempo === "unavailable" && (
        <div
          role="status"
          className="mb-6 border border-degraded/40 bg-degraded/10 px-4 py-3 font-mono text-sm text-degraded"
        >
          ⚠ {result.backend.message ?? "Traces backend temporarily unavailable."}
        </div>
      )}

      <form className="mb-6 flex flex-wrap items-end gap-3 border border-[var(--line)] bg-paper/60 p-4">
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wider text-ink/45">
          Service
          <select
            name="service"
            defaultValue={params.service ?? ""}
            className="min-w-[160px] border border-[var(--line)] bg-paper px-2 py-2 text-sm text-ink normal-case"
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
          Min duration
          <select
            name="minDuration"
            defaultValue={params.minDuration ?? ""}
            className="min-w-[140px] border border-[var(--line)] bg-paper px-2 py-2 text-sm text-ink normal-case"
          >
            <option value="">Any</option>
            <option value="100ms">100ms</option>
            <option value="500ms">500ms</option>
            <option value="1s">1s</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wider text-ink/45">
          Status
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="min-w-[120px] border border-[var(--line)] bg-paper px-2 py-2 text-sm text-ink normal-case"
          >
            <option value="">Any</option>
            <option value="error">Error</option>
          </select>
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
          <h1 className="font-display text-2xl font-bold">Traces</h1>
          <p className="font-mono text-xs text-ink/45">
            {result.traces.length} results ·{" "}
            {new Date(result.generatedAt).toLocaleTimeString()}
          </p>
        </div>

        <div className="overflow-x-auto border border-[var(--line)] bg-paper/70">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--line)] font-mono text-xs uppercase tracking-wider text-ink/50">
                <th className="px-4 py-3 font-medium">Trace ID</th>
                <th className="px-4 py-3 font-medium">Root service</th>
                <th className="px-4 py-3 font-medium">Operation</th>
                <th className="px-4 py-3 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {result.traces.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 font-mono text-sm text-ink/50"
                  >
                    No traces matched. Generate demo traffic, then search again.
                  </td>
                </tr>
              ) : (
                result.traces.map((t) => (
                  <tr
                    key={t.traceId}
                    className="border-b border-[var(--line)] last:border-0 hover:bg-mist/30"
                  >
                    <td className="px-4 py-3 font-mono text-sm">
                      <Link
                        href={`/traces/${t.traceId}`}
                        className="text-accent hover:underline"
                      >
                        {t.traceId.slice(0, 16)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {t.rootServiceName}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {t.rootTraceName}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {formatMs(t.durationMs)}
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
