export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "unknown";

export interface LogEntry {
  timestamp: string;
  timestampNs: string;
  service: string;
  level: LogLevel;
  message: string;
  traceId?: string;
  spanId?: string;
  attributes: Record<string, string>;
}

export interface LogSearchResult {
  logs: LogEntry[];
  generatedAt: string;
  backend: {
    loki: "ok" | "unavailable";
    message?: string;
  };
}
