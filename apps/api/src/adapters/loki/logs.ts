import type { LogEntry, LogLevel, LogSearchResult } from "@tracelens/types";
import { LokiClient } from "./client.js";

function escapeLogqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeLevel(raw: string | undefined): LogLevel {
  const v = (raw ?? "").toLowerCase();
  if (
    v === "trace" ||
    v === "debug" ||
    v === "info" ||
    v === "warn" ||
    v === "error" ||
    v === "fatal"
  ) {
    return v;
  }
  return "unknown";
}

function buildLogql(opts: {
  service?: string;
  level?: string;
  traceId?: string;
  q?: string;
}): string {
  const selector = opts.service
    ? `{service_name="${escapeLogqlString(opts.service)}"}`
    : `{service_name=~".+"}`;

  const pipeline: string[] = [];
  if (opts.level) {
    pipeline.push(`| detected_level="${escapeLogqlString(opts.level.toLowerCase())}"`);
  }
  if (opts.traceId) {
    pipeline.push(`| trace_id="${escapeLogqlString(opts.traceId)}"`);
  }
  if (opts.q) {
    pipeline.push(`|= "${escapeLogqlString(opts.q)}"`);
  }

  return `${selector}${pipeline.length ? ` ${pipeline.join(" ")}` : ""}`;
}

function rangeToNs(range: string | undefined): { startNs: string; endNs: string } {
  const endMs = Date.now();
  const map: Record<string, number> = {
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "6h": 6 * 60 * 60_000,
    "24h": 24 * 60 * 60_000,
  };
  const windowMs = map[range ?? "1h"] ?? map["1h"]!;
  const startMs = endMs - windowMs;
  return {
    startNs: `${startMs}000000`,
    endNs: `${endMs}000000`,
  };
}

const RESERVED_STREAM_KEYS = new Set([
  "service_name",
  "service",
  "detected_level",
  "severity_text",
  "severity_number",
  "trace_id",
  "span_id",
  "flags",
  "observed_timestamp",
  "scope_name",
  "service_name_extracted",
  "service_version",
  "telemetry_sdk_language",
  "telemetry_sdk_name",
  "telemetry_sdk_version",
]);

export async function searchLogs(
  lokiUrl: string,
  opts: {
    service?: string;
    level?: string;
    traceId?: string;
    q?: string;
    range?: string;
    limit?: number;
  } = {},
): Promise<LogSearchResult> {
  const client = new LokiClient(lokiUrl);
  const ready = await client.ready();
  if (!ready) {
    return {
      logs: [],
      generatedAt: new Date().toISOString(),
      backend: {
        loki: "unavailable",
        message: "Logs backend temporarily unavailable.",
      },
    };
  }

  const { startNs, endNs } = rangeToNs(opts.range);
  const query = buildLogql(opts);

  try {
    const result = await client.queryRange({
      query,
      startNs,
      endNs,
      limit: opts.limit ?? 100,
    });

    const logs: LogEntry[] = [];
    for (const stream of result.data?.result ?? []) {
      const labels = stream.stream;
      const service = labels.service_name ?? labels.service ?? "unknown";
      const level = normalizeLevel(labels.detected_level ?? labels.severity_text);
      const traceId = labels.trace_id || undefined;
      const spanId = labels.span_id || undefined;
      const attributes: Record<string, string> = {};
      for (const [k, v] of Object.entries(labels)) {
        if (!RESERVED_STREAM_KEYS.has(k) && v) attributes[k] = v;
      }

      for (const [tsNs, message] of stream.values ?? []) {
        logs.push({
          timestampNs: tsNs,
          timestamp: new Date(Number(tsNs.slice(0, 13))).toISOString(),
          service,
          level,
          message,
          traceId,
          spanId,
          attributes,
        });
      }
    }

    logs.sort((a, b) => (a.timestampNs < b.timestampNs ? 1 : -1));

    return {
      logs,
      generatedAt: new Date().toISOString(),
      backend: { loki: "ok" },
    };
  } catch (err) {
    return {
      logs: [],
      generatedAt: new Date().toISOString(),
      backend: {
        loki: "unavailable",
        message:
          err instanceof Error
            ? err.message
            : "Logs backend temporarily unavailable.",
      },
    };
  }
}
