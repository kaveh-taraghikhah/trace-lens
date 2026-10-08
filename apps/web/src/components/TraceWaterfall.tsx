"use client";

import { useMemo, useState } from "react";
import type { TraceDetail, TraceSpan } from "@tracelens/types";

const SERVICE_COLORS = [
  "#0f766e",
  "#1d4ed8",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#0f766e",
  "#0369a1",
];

function colorForService(service: string, palette: Map<string, string>): string {
  if (!palette.has(service)) {
    palette.set(
      service,
      SERVICE_COLORS[palette.size % SERVICE_COLORS.length]!,
    );
  }
  return palette.get(service)!;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms >= 10) return `${Math.round(ms)}ms`;
  return `${ms.toFixed(1)}ms`;
}

export function TraceWaterfall({ trace }: { trace: TraceDetail }) {
  const [selectedId, setSelectedId] = useState<string | null>(
    trace.spans[0]?.spanId ?? null,
  );

  const palette = useMemo(() => new Map<string, string>(), [trace.traceId]);
  const selected = trace.spans.find((s) => s.spanId === selectedId) ?? null;
  const total = Math.max(trace.durationMs, 1);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="border border-[var(--line)] bg-paper/70">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-ink/45">
              Trace
            </p>
            <p className="font-mono text-sm">{trace.traceId.slice(0, 16)}</p>
          </div>
          <p className="font-mono text-sm text-ink/60">
            {trace.rootServiceName} · {trace.rootOperation} ·{" "}
            {formatMs(trace.durationMs)}
          </p>
        </div>

        <div className="relative overflow-x-auto px-2 py-3">
          <div className="mb-2 flex justify-between px-2 font-mono text-[10px] text-ink/40">
            <span>0ms</span>
            <span>{formatMs(total / 2)}</span>
            <span>{formatMs(total)}</span>
          </div>

          <ul className="space-y-1">
            {trace.spans.map((span) => (
              <WaterfallRow
                key={span.spanId}
                span={span}
                totalMs={total}
                color={colorForService(span.serviceName, palette)}
                selected={span.spanId === selectedId}
                onSelect={() => setSelectedId(span.spanId)}
              />
            ))}
          </ul>
        </div>
      </div>

      <aside className="border border-[var(--line)] bg-paper/70 p-4">
        <p className="font-mono text-xs uppercase tracking-wider text-ink/45">
          Span Details
        </p>
        {!selected ? (
          <p className="mt-4 font-mono text-sm text-ink/50">Select a span</p>
        ) : (
          <div className="mt-4 space-y-3 font-mono text-sm">
            <Detail label="Service" value={selected.serviceName} />
            <Detail label="Operation" value={selected.name} />
            <Detail label="Duration" value={formatMs(selected.durationMs)} />
            <Detail
              label="Status"
              value={selected.status.toUpperCase()}
              tone={selected.status === "error" ? "critical" : undefined}
            />
            {selected.kind && <Detail label="Kind" value={selected.kind} />}
            <Detail label="Span ID" value={selected.spanId} />
            {Object.keys(selected.attributes).length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-ink/45">
                  Attributes
                </p>
                <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
                  {Object.entries(selected.attributes).map(([k, v]) => (
                    <li key={k} className="break-all text-ink/80">
                      <span className="text-accent">{k}</span>={String(v)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function WaterfallRow({
  span,
  totalMs,
  color,
  selected,
  onSelect,
}: {
  span: TraceSpan;
  totalMs: number;
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const left = Math.min(100, (span.startOffsetMs / totalMs) * 100);
  const width = Math.max(0.4, Math.min(100 - left, (span.durationMs / totalMs) * 100));
  const isError = span.status === "error";

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`grid w-full grid-cols-[200px_1fr] items-center gap-2 px-2 py-1 text-left transition ${
          selected ? "bg-mist/50" : "hover:bg-mist/30"
        }`}
      >
        <span
          className="truncate font-mono text-xs"
          style={{ paddingLeft: `${span.depth * 12}px` }}
          title={`${span.serviceName} ${span.name}`}
        >
          <span className="text-ink/45">{span.serviceName}</span>
          <span className="mx-1 text-ink/25">·</span>
          <span className={isError ? "text-critical" : ""}>{span.name}</span>
        </span>
        <span className="relative h-5 min-w-[200px]">
          <span
            className="absolute top-0.5 h-4 rounded-[2px]"
            style={{
              left: `${left}%`,
              width: `${width}%`,
              backgroundColor: isError ? "var(--critical)" : color,
              opacity: selected ? 1 : 0.85,
            }}
          />
          <span className="absolute right-0 top-0.5 font-mono text-[10px] text-ink/45">
            {formatMs(span.durationMs)}
          </span>
        </span>
      </button>
    </li>
  );
}

function Detail({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "critical";
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-ink/45">{label}</p>
      <p className={`mt-0.5 break-all ${tone === "critical" ? "text-critical" : ""}`}>
        {value}
      </p>
    </div>
  );
}
