export interface PrometheusQueryResult {
  status: string;
  data?: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value?: [number, string];
      values?: Array<[number, string]>;
    }>;
  };
  error?: string;
  errorType?: string;
}

export class PrometheusClient {
  constructor(private readonly baseUrl: string) {}

  async query(promql: string): Promise<PrometheusQueryResult> {
    const url = new URL("/api/v1/query", this.baseUrl);
    url.searchParams.set("query", promql);

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      throw new Error(`Prometheus query failed: HTTP ${res.status}`);
    }

    return (await res.json()) as PrometheusQueryResult;
  }

  async ready(): Promise<boolean> {
    try {
      const res = await fetch(new URL("/-/ready", this.baseUrl), {
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/** Parse an instant-vector into serviceName → number. */
export function vectorByLabel(
  result: PrometheusQueryResult,
  label: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of result.data?.result ?? []) {
    const key = row.metric[label];
    if (!key || !row.value) continue;
    const n = Number(row.value[1]);
    if (Number.isFinite(n)) map.set(key, n);
  }
  return map;
}
