import type {
  SpanStatus,
  TraceDetail,
  TraceSearchResult,
  TraceSpan,
  TraceSummary,
} from "@tracelens/types";
import {
  TempoClient,
  type OtlpAnyValue,
  type OtlpAttribute,
  type OtlpSpan,
} from "./client.js";

function attrValue(value: OtlpAnyValue | undefined): string | number | boolean | undefined {
  if (!value) return undefined;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.intValue !== undefined) return Number(value.intValue);
  return undefined;
}

function attrsToRecord(
  attrs: OtlpAttribute[] | undefined,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const a of attrs ?? []) {
    const v = attrValue(a.value);
    if (v !== undefined) out[a.key] = v;
  }
  return out;
}

/** Tempo JSON API returns span IDs as base64; normalize to hex. */
export function normalizeId(id: string | undefined): string | null {
  if (!id) return null;
  if (/^[0-9a-fA-F]+$/.test(id) && id.length % 2 === 0) {
    return id.toLowerCase();
  }
  try {
    return Buffer.from(id, "base64").toString("hex");
  } catch {
    return id;
  }
}

function spanStatus(status: OtlpSpan["status"]): SpanStatus {
  const code = status?.code;
  if (code === 2 || code === "STATUS_CODE_ERROR" || code === "ERROR") return "error";
  if (code === 1 || code === "STATUS_CODE_OK" || code === "OK") return "ok";
  return "unset";
}

function kindName(kind: number | string | undefined): string | undefined {
  if (kind === undefined) return undefined;
  const map: Record<number, string> = {
    0: "UNSPECIFIED",
    1: "INTERNAL",
    2: "SERVER",
    3: "CLIENT",
    4: "PRODUCER",
    5: "CONSUMER",
  };
  if (typeof kind === "number") return map[kind] ?? String(kind);
  return String(kind);
}

function serviceFromResource(attrs: OtlpAttribute[] | undefined): string {
  const record = attrsToRecord(attrs);
  const name = record["service.name"] ?? record.service_name;
  return typeof name === "string" ? name : "unknown";
}

function buildDepths(spans: TraceSpan[]): void {
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const depthOf = (span: TraceSpan, seen = new Set<string>()): number => {
    if (seen.has(span.spanId)) return 0;
    seen.add(span.spanId);
    if (!span.parentSpanId || !byId.has(span.parentSpanId)) return 0;
    return 1 + depthOf(byId.get(span.parentSpanId)!, seen);
  };
  for (const span of spans) {
    span.depth = depthOf(span);
  }
}

function sortWaterfall(spans: TraceSpan[]): TraceSpan[] {
  const children = new Map<string | null, TraceSpan[]>();
  for (const span of spans) {
    const key = span.parentSpanId && spans.some((s) => s.spanId === span.parentSpanId)
      ? span.parentSpanId
      : null;
    const list = children.get(key) ?? [];
    list.push(span);
    children.set(key, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.startOffsetMs - b.startOffsetMs || a.durationMs - b.durationMs);
  }

  const ordered: TraceSpan[] = [];
  const walk = (parentId: string | null) => {
    for (const child of children.get(parentId) ?? []) {
      ordered.push(child);
      walk(child.spanId);
    }
  };
  walk(null);
  // orphans already attached under null; ensure nothing missing
  if (ordered.length < spans.length) {
    const seen = new Set(ordered.map((s) => s.spanId));
    for (const span of spans) {
      if (!seen.has(span.spanId)) ordered.push(span);
    }
  }
  return ordered;
}

function escapeTraceqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** TraceQL duration literal, e.g. 100ms, 1.5s, 2m — reject anything else. */
const TRACEQL_DURATION = /^\d+(\.\d+)?(ns|us|µs|ms|s|m|h)$/;

function buildTraceql(opts: {
  service?: string;
  minDuration?: string;
  status?: string;
}): string {
  const parts: string[] = [];
  if (opts.service) {
    parts.push(
      `resource.service.name="${escapeTraceqlString(opts.service)}"`,
    );
  }
  if (opts.minDuration) {
    const duration = opts.minDuration.trim();
    if (!TRACEQL_DURATION.test(duration)) {
      throw new Error(
        `Invalid minDuration "${opts.minDuration}" (expected e.g. 100ms, 1s)`,
      );
    }
    parts.push(`duration>${duration}`);
  }
  if (opts.status === "error") {
    parts.push(`status=error`);
  }
  return parts.length > 0 ? `{${parts.join(" && ")}}` : "{}";
}

export async function searchTraces(
  tempoUrl: string,
  opts: {
    service?: string;
    minDuration?: string;
    status?: string;
    limit?: number;
  } = {},
): Promise<TraceSearchResult> {
  const client = new TempoClient(tempoUrl);
  const ready = await client.ready();
  if (!ready) {
    return {
      traces: [],
      generatedAt: new Date().toISOString(),
      backend: {
        tempo: "unavailable",
        message: "Traces backend temporarily unavailable.",
      },
    };
  }

  let query: string;
  try {
    query = buildTraceql(opts);
  } catch (err) {
    return {
      traces: [],
      generatedAt: new Date().toISOString(),
      backend: {
        tempo: "unavailable",
        message:
          err instanceof Error ? err.message : "Invalid trace search filters.",
      },
    };
  }

  try {
    const result = await client.search({
      query,
      limit: opts.limit ?? 50,
    });

    const traces: TraceSummary[] = (result.traces ?? []).map((t) => ({
      traceId: t.traceID,
      rootServiceName: t.rootServiceName ?? "unknown",
      rootTraceName: t.rootTraceName ?? "unknown",
      startTimeUnixNano: t.startTimeUnixNano ?? "0",
      durationMs: t.durationMs ?? 0,
    }));

    return {
      traces,
      generatedAt: new Date().toISOString(),
      backend: { tempo: "ok" },
    };
  } catch (err) {
    return {
      traces: [],
      generatedAt: new Date().toISOString(),
      backend: {
        tempo: "unavailable",
        message:
          err instanceof Error
            ? err.message
            : "Traces backend temporarily unavailable.",
      },
    };
  }
}

export async function getTraceDetail(
  tempoUrl: string,
  traceId: string,
): Promise<TraceDetail> {
  const client = new TempoClient(tempoUrl);
  const ready = await client.ready();
  if (!ready) {
    return {
      traceId,
      rootServiceName: "unknown",
      rootOperation: "unknown",
      durationMs: 0,
      startTimeUnixNano: "0",
      spans: [],
      generatedAt: new Date().toISOString(),
      backend: {
        tempo: "unavailable",
        message: "Traces backend temporarily unavailable.",
      },
    };
  }

  try {
    const raw = await client.getTrace(traceId);
    const flat: Array<{
      span: OtlpSpan;
      serviceName: string;
    }> = [];

    for (const batch of raw.batches ?? []) {
      const serviceName = serviceFromResource(batch.resource?.attributes);
      for (const scope of batch.scopeSpans ?? []) {
        for (const span of scope.spans ?? []) {
          flat.push({ span, serviceName });
        }
      }
    }

    if (flat.length === 0) {
      return {
        traceId,
        rootServiceName: "unknown",
        rootOperation: "unknown",
        durationMs: 0,
        startTimeUnixNano: "0",
        spans: [],
        generatedAt: new Date().toISOString(),
        backend: { tempo: "ok" },
      };
    }

    const starts = flat.map((f) => Number(f.span.startTimeUnixNano ?? 0));
    const ends = flat.map((f) => Number(f.span.endTimeUnixNano ?? 0));
    const traceStart = Math.min(...starts);
    const traceEnd = Math.max(...ends);
    const durationMs = (traceEnd - traceStart) / 1e6;

    let spans: TraceSpan[] = flat.map(({ span, serviceName }) => {
      const start = Number(span.startTimeUnixNano ?? 0);
      const end = Number(span.endTimeUnixNano ?? 0);
      return {
        spanId: normalizeId(span.spanId) ?? "unknown",
        parentSpanId: normalizeId(span.parentSpanId),
        traceId: normalizeId(span.traceId) ?? traceId,
        name: span.name ?? "unnamed",
        serviceName,
        startOffsetMs: (start - traceStart) / 1e6,
        durationMs: Math.max(0, (end - start) / 1e6),
        status: spanStatus(span.status),
        kind: kindName(span.kind),
        attributes: attrsToRecord(span.attributes),
        depth: 0,
      };
    });

    buildDepths(spans);
    spans = sortWaterfall(spans);

    const root =
      spans.find((s) => !s.parentSpanId || !spans.some((p) => p.spanId === s.parentSpanId)) ??
      spans[0]!;

    return {
      traceId,
      rootServiceName: root.serviceName,
      rootOperation: root.name,
      durationMs,
      startTimeUnixNano: String(traceStart),
      spans,
      generatedAt: new Date().toISOString(),
      backend: { tempo: "ok" },
    };
  } catch (err) {
    return {
      traceId,
      rootServiceName: "unknown",
      rootOperation: "unknown",
      durationMs: 0,
      startTimeUnixNano: "0",
      spans: [],
      generatedAt: new Date().toISOString(),
      backend: {
        tempo: "unavailable",
        message:
          err instanceof Error
            ? err.message
            : "Traces backend temporarily unavailable.",
      },
    };
  }
}
