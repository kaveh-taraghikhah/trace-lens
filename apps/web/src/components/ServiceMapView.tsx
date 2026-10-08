"use client";

import { useMemo, useState } from "react";
import type { ServiceHealth, ServiceMap, ServiceMapEdge } from "@tracelens/types";

const WIDTH = 920;
const HEIGHT = 520;
const NODE_W = 150;
const NODE_H = 56;

function healthColor(health: ServiceHealth): string {
  if (health === "healthy") return "var(--healthy)";
  if (health === "degraded") return "var(--degraded)";
  if (health === "critical") return "var(--critical)";
  return "rgba(14,20,27,0.35)";
}

function formatRate(v: number | null): string {
  if (v === null) return "—";
  if (v < 0.01) return v.toFixed(3);
  return v.toFixed(2);
}

function formatErr(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function formatMs(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(2)}s`;
  return `${Math.round(v)}ms`;
}

function layoutNodes(ids: string[]): Map<string, { x: number; y: number }> {
  // Prefer known demo layering; otherwise topological-ish columns.
  const preferred: string[][] = [
    ["shop-api"],
    ["order-api", "product-api"],
    ["payment-api", "notification-worker"],
  ];

  const placed = new Set<string>();
  const layers: string[][] = preferred.map((layer) =>
    layer.filter((id) => ids.includes(id)),
  );
  for (const layer of layers) for (const id of layer) placed.add(id);

  const rest = ids.filter((id) => !placed.has(id));
  if (rest.length) layers.push(rest);

  const positions = new Map<string, { x: number; y: number }>();
  const usableW = WIDTH - 80;
  const usableH = HEIGHT - 80;

  layers.forEach((layer, col) => {
    const x =
      layers.length === 1
        ? WIDTH / 2
        : 60 + (col * usableW) / Math.max(1, layers.length - 1);
    layer.forEach((id, row) => {
      const y =
        layer.length === 1
          ? HEIGHT / 2
          : 60 + (row * usableH) / Math.max(1, layer.length - 1);
      positions.set(id, { x, y });
    });
  });

  return positions;
}

export function ServiceMapView({ map }: { map: ServiceMap }) {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(
    map.edges[0]?.id ?? null,
  );

  const positions = useMemo(
    () => layoutNodes(map.nodes.map((n) => n.id)),
    [map.nodes],
  );

  const selected: ServiceMapEdge | null =
    map.edges.find((e) => e.id === selectedEdgeId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="overflow-x-auto border border-[var(--line)] bg-paper/70">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto min-w-[640px] w-full"
          role="img"
          aria-label="Service dependency map"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(14,20,27,0.45)" />
            </marker>
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
            </marker>
          </defs>

          {map.edges.map((edge) => {
            const from = positions.get(edge.source);
            const to = positions.get(edge.target);
            if (!from || !to) return null;
            const active = edge.id === selectedEdgeId;
            const x1 = from.x + NODE_W / 2;
            const y1 = from.y;
            const x2 = to.x - NODE_W / 2;
            const y2 = to.y;
            return (
              <g key={edge.id}>
                <path
                  d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={active ? "var(--accent)" : "rgba(14,20,27,0.28)"}
                  strokeWidth={active ? 2.5 : 1.5}
                  markerEnd={active ? "url(#arrow-active)" : "url(#arrow)"}
                  className="cursor-pointer"
                  onClick={() => setSelectedEdgeId(edge.id)}
                />
                {/* wider hit area */}
                <path
                  d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  className="cursor-pointer"
                  onClick={() => setSelectedEdgeId(edge.id)}
                />
              </g>
            );
          })}

          {map.nodes.map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const x = pos.x - NODE_W / 2;
            const y = pos.y - NODE_H / 2;
            return (
              <g key={node.id} transform={`translate(${x}, ${y})`}>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={2}
                  fill="rgba(243,240,232,0.95)"
                  stroke={healthColor(node.health)}
                  strokeWidth={2}
                />
                <circle cx={14} cy={NODE_H / 2} r={5} fill={healthColor(node.health)} />
                <text
                  x={28}
                  y={NODE_H / 2 + 4}
                  className="fill-[var(--ink)]"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                >
                  {node.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <aside className="border border-[var(--line)] bg-paper/70 p-4">
        <p className="font-mono text-xs uppercase tracking-wider text-ink/45">
          Dependency
        </p>
        {!selected ? (
          <p className="mt-4 font-mono text-sm text-ink/50">
            Click an edge to inspect request rate, errors, and latency.
          </p>
        ) : (
          <div className="mt-4 space-y-3 font-mono text-sm">
            <p className="text-base">
              <span className="text-accent">{selected.source}</span>
              <span className="mx-2 text-ink/40">→</span>
              <span className="text-accent">{selected.target}</span>
            </p>
            <Detail label="Requests/s" value={formatRate(selected.requestsPerSecond)} />
            <Detail label="Error rate" value={formatErr(selected.errorRate)} />
            <Detail label="p95 latency" value={formatMs(selected.p95LatencyMs)} />
          </div>
        )}

        <div className="mt-8 border-t border-[var(--line)] pt-4">
          <p className="mb-3 font-mono text-xs uppercase tracking-wider text-ink/45">
            Nodes
          </p>
          <ul className="space-y-2 font-mono text-xs">
            {map.nodes.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: healthColor(n.health) }}
                  />
                  {n.id}
                </span>
                <span className="capitalize text-ink/45">{n.health}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-ink/45">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}
