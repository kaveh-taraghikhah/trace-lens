import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TraceWaterfall } from "@/components/TraceWaterfall";
import { fetchTrace } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = await params;
  const trace = await fetchTrace(traceId);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <AppHeader
        active="traces"
        subtitle="Span timeline from Tempo."
      />

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link
          href="/traces"
          className="font-mono text-sm text-accent hover:underline"
        >
          ← Back to traces
        </Link>
        <Link
          href={`/logs?traceId=${encodeURIComponent(traceId)}`}
          className="font-mono text-sm text-accent hover:underline"
        >
          View correlated logs →
        </Link>
      </div>

      {trace.backend.tempo === "unavailable" && (
        <div
          role="status"
          className="mb-6 border border-degraded/40 bg-degraded/10 px-4 py-3 font-mono text-sm text-degraded"
        >
          ⚠ {trace.backend.message ?? "Traces backend temporarily unavailable."}
        </div>
      )}

      {trace.spans.length === 0 ? (
        <p className="font-mono text-sm text-ink/50">
          Trace not found or has no spans yet.
        </p>
      ) : (
        <TraceWaterfall trace={trace} />
      )}
    </main>
  );
}
