import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import pino, { type Logger, type DestinationStream } from "pino";

export interface TelemetryOptions {
  serviceName: string;
  serviceVersion?: string;
  /** OTLP endpoint, e.g. http://otel-collector:4317 */
  otlpEndpoint?: string;
}

let sdk: NodeSDK | undefined;
let loggerProvider: LoggerProvider | undefined;
let logger: Logger | undefined;

const SEVERITY: Record<string, SeverityNumber> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

function createOtlpPinoStream(serviceName: string): DestinationStream {
  const otelLogger = logs.getLogger(serviceName);

  return {
    write(chunk: string) {
      process.stdout.write(chunk);
      try {
        const line = JSON.parse(chunk) as Record<string, unknown>;
        const level = String(line.level ?? "info");
        const message = String(line.message ?? line.msg ?? "");
        const { level: _l, message: _m, msg: _msg, time: _t, ...attrs } = line;

        otelLogger.emit({
          body: message,
          severityNumber: SEVERITY[level] ?? SeverityNumber.INFO,
          severityText: level.toUpperCase(),
          attributes: {
            ...Object.fromEntries(
              Object.entries(attrs).map(([k, v]) => [
                k,
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean"
                  ? v
                  : JSON.stringify(v),
              ]),
            ),
            "service.name": serviceName,
          },
        });
      } catch {
        // ignore non-JSON or emit failures; stdout already has the line
      }
    },
  };
}

export function createLogger(serviceName: string): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: serviceName },
      mixin() {
        const span = trace.getSpan(context.active());
        if (!span) return {};
        const spanContext = span.spanContext();
        return {
          trace_id: spanContext.traceId,
          span_id: spanContext.spanId,
        };
      },
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      messageKey: "message",
    },
    createOtlpPinoStream(serviceName),
  );
}

/**
 * Sampling (head-based, SDK):
 * Default ratio 1.0 for local demos so every request is visible.
 * Set OTEL_TRACES_SAMPLER_ARG=0.1 for ~10% of normal traffic.
 *
 * Production intent (Collector/tail sampling later):
 *   100% errors, 100% slow (>1s), 10% normal.
 */
export async function initTelemetry(
  options: TelemetryOptions,
): Promise<{ logger: Logger; shutdown: () => Promise<void> }> {
  const endpoint =
    options.otlpEndpoint ??
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    "http://localhost:4317";

  const sampleRatio = Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? "1.0");
  const ratio = Number.isFinite(sampleRatio) ? sampleRatio : 1.0;

  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: options.serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: options.serviceVersion ?? "0.0.1",
  });

  loggerProvider = new LoggerProvider({ resource });
  loggerProvider.addLogRecordProcessor(
    new BatchLogRecordProcessor(new OTLPLogExporter({ url: endpoint })),
  );
  logs.setGlobalLoggerProvider(loggerProvider);

  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: endpoint }),
      exportIntervalMillis: 10_000,
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(ratio),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
      }),
    ],
  });

  sdk.start();

  logger = createLogger(options.serviceName);

  const shutdown = async () => {
    await loggerProvider?.shutdown();
    await sdk?.shutdown();
  };

  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });

  logger.info(
    { otlpEndpoint: endpoint, sampleRatio: ratio },
    "telemetry initialized",
  );

  return { logger, shutdown };
}

export function getLogger(): Logger {
  if (!logger) {
    throw new Error("Telemetry not initialized — call initTelemetry first");
  }
  return logger;
}

export { context, trace, SpanStatusCode };
