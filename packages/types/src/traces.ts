export type SpanStatus = "ok" | "error" | "unset";

export interface TraceSummary {
  traceId: string;
  rootServiceName: string;
  rootTraceName: string;
  startTimeUnixNano: string;
  durationMs: number;
}

export interface TraceSearchResult {
  traces: TraceSummary[];
  generatedAt: string;
  backend: {
    tempo: "ok" | "unavailable";
    message?: string;
  };
}

export interface TraceSpan {
  spanId: string;
  parentSpanId: string | null;
  traceId: string;
  name: string;
  serviceName: string;
  startOffsetMs: number;
  durationMs: number;
  status: SpanStatus;
  kind?: string;
  attributes: Record<string, string | number | boolean>;
  depth: number;
}

export interface TraceDetail {
  traceId: string;
  rootServiceName: string;
  rootOperation: string;
  durationMs: number;
  startTimeUnixNano: string;
  spans: TraceSpan[];
  generatedAt: string;
  backend: {
    tempo: "ok" | "unavailable";
    message?: string;
  };
}
