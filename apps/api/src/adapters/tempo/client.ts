export interface TempoSearchResponse {
  traces?: Array<{
    traceID: string;
    rootServiceName?: string;
    rootTraceName?: string;
    startTimeUnixNano?: string;
    durationMs?: number;
  }>;
}

export interface OtlpAnyValue {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
}

export interface OtlpAttribute {
  key: string;
  value: OtlpAnyValue;
}

export interface OtlpSpan {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  kind?: number | string;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: OtlpAttribute[];
  status?: { code?: number | string; message?: string };
}

export interface OtlpTraceResponse {
  batches?: Array<{
    resource?: { attributes?: OtlpAttribute[] };
    scopeSpans?: Array<{ spans?: OtlpSpan[] }>;
  }>;
}

export class TempoClient {
  constructor(private readonly baseUrl: string) {}

  async ready(): Promise<boolean> {
    try {
      // Tempo /ready can flap 503 while search still serves; probe search instead.
      const url = new URL("/api/search", this.baseUrl);
      url.searchParams.set("q", "{}");
      url.searchParams.set("limit", "1");
      const res = await fetch(url, {
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async search(params: {
    query?: string;
    limit?: number;
    start?: number;
    end?: number;
  }): Promise<TempoSearchResponse> {
    const url = new URL("/api/search", this.baseUrl);
    url.searchParams.set("q", params.query ?? "{}");
    url.searchParams.set("limit", String(params.limit ?? 50));
    if (params.start) url.searchParams.set("start", String(params.start));
    if (params.end) url.searchParams.set("end", String(params.end));

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      throw new Error(`Tempo search failed: HTTP ${res.status}`);
    }
    return (await res.json()) as TempoSearchResponse;
  }

  async getTrace(traceId: string): Promise<OtlpTraceResponse> {
    const res = await fetch(new URL(`/api/traces/${traceId}`, this.baseUrl), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Tempo getTrace failed: HTTP ${res.status}`);
    }
    return (await res.json()) as OtlpTraceResponse;
  }
}
