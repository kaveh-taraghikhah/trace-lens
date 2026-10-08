import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ServiceMapView } from "@/components/ServiceMapView";
import { fetchServiceMap } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ServiceMapPage() {
  const map = await fetchServiceMap();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <AppHeader
        active="services"
        subtitle="Dependencies from client spans in Prometheus."
      />

      <div className="mb-6 flex flex-wrap items-center gap-4 font-mono text-sm">
        <Link href="/services" className="text-accent hover:underline">
          ← Services table
        </Link>
        <span className="text-ink/30">/</span>
        <span className="text-ink/60">Map</span>
      </div>

      {map.backend.prometheus === "unavailable" && (
        <div
          role="status"
          className="mb-6 border border-degraded/40 bg-degraded/10 px-4 py-3 font-mono text-sm text-degraded"
        >
          ⚠ {map.backend.message ?? "Metrics backend temporarily unavailable."}{" "}
          Showing fallback topology.
        </div>
      )}

      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl font-bold">Service map</h1>
        <p className="font-mono text-xs text-ink/45">
          {map.nodes.length} services · {map.edges.length} edges ·{" "}
          {new Date(map.generatedAt).toLocaleTimeString()}
        </p>
      </div>

      <ServiceMapView map={map} />
    </main>
  );
}
