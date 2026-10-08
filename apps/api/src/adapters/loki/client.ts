export interface LokiQueryRangeResponse {
  status: string;
  data?: {
    resultType: string;
    result: Array<{
      stream: Record<string, string>;
      values: Array<[string, string]>;
    }>;
  };
  error?: string;
}

export class LokiClient {
  constructor(private readonly baseUrl: string) {}

  async ready(): Promise<boolean> {
    try {
      // /ready can be flaky; probe labels endpoint instead
      const res = await fetch(new URL("/loki/api/v1/labels", this.baseUrl), {
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async queryRange(params: {
    query: string;
    startNs: string;
    endNs: string;
    limit?: number;
  }): Promise<LokiQueryRangeResponse> {
    const url = new URL("/loki/api/v1/query_range", this.baseUrl);
    url.searchParams.set("query", params.query);
    url.searchParams.set("start", params.startNs);
    url.searchParams.set("end", params.endNs);
    url.searchParams.set("limit", String(params.limit ?? 100));
    url.searchParams.set("direction", "backward");

    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      throw new Error(`Loki query failed: HTTP ${res.status}`);
    }
    return (await res.json()) as LokiQueryRangeResponse;
  }
}
