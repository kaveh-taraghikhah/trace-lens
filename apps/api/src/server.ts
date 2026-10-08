import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createHash } from "node:crypto";
import {
  AlertRepository,
  IncidentRepository,
  PlatformRepository,
  ensurePlatformDatabase,
  migrate,
} from "@tracelens/database";
import { initTelemetry } from "@tracelens/telemetry";
import { searchLogs } from "./adapters/loki/logs.js";
import { PrometheusClient } from "./adapters/prometheus/client.js";
import { getServiceMap } from "./adapters/prometheus/service-map.js";
import { getServicesOverview } from "./adapters/prometheus/services.js";
import { getTraceDetail, searchTraces } from "./adapters/tempo/traces.js";
import { AlertEvaluator, startAlertScheduler } from "./alerts/evaluator.js";
import { registerAlertRoutes } from "./alerts/routes.js";
import { createAuthHook, getAuthMode, requireRole } from "./auth/middleware.js";
import { registerIncidentRoutes } from "./incidents/routes.js";
import { registerPlatformRoutes } from "./platform/routes.js";

const PORT = Number(process.env.PORT ?? 4000);
const PROMETHEUS_URL =
  process.env.PROMETHEUS_URL ?? "http://localhost:9090";
const TEMPO_URL = process.env.TEMPO_URL ?? "http://localhost:3200";
const LOKI_URL = process.env.LOKI_URL ?? "http://localhost:3100";
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://tracelens:tracelens@localhost:5432/tracelens";
const DATABASE_ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  DATABASE_URL.replace(/\/[^/]+(?:\?.*)?$/, "/postgres");
const ALERT_EVAL_INTERVAL_MS = Number(
  process.env.ALERT_EVAL_INTERVAL_MS ?? 15_000,
);
const PAYMENT_API_URL =
  process.env.PAYMENT_API_URL ?? "http://localhost:3004";
const RATE_LIMIT_MAX = Number(process.env.TRACELENS_RATE_LIMIT_MAX ?? 120);

function rateLimitKeyFromRequest(req: {
  headers: Record<string, unknown>;
  ip: string;
}): string {
  const headerKey = req.headers["x-api-key"];
  let plaintext: string | null = null;
  if (typeof headerKey === "string" && headerKey.trim()) {
    plaintext = headerKey.trim();
  } else {
    const auth = req.headers.authorization;
    if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
      plaintext = auth.slice(7).trim();
    }
  }
  if (plaintext) {
    // Hash the full key so distinct keys never share a bucket (prefix collision).
    return `key:${createHash("sha256").update(plaintext).digest("hex")}`;
  }
  return req.ip;
}

async function main() {
  const { logger } = await initTelemetry({ serviceName: "tracelens-api" });

  const pool = await ensurePlatformDatabase({
    adminUrl: DATABASE_ADMIN_URL,
    databaseUrl: DATABASE_URL,
  });
  const applied = await migrate(pool);
  if (applied.length) {
    logger.info({ applied }, "database migrations applied");
  }

  const repo = new AlertRepository(pool);
  const incidentRepo = new IncidentRepository(pool);
  const platform = new PlatformRepository(pool);
  const prometheus = new PrometheusClient(PROMETHEUS_URL);
  const evaluator = new AlertEvaluator(repo, prometheus, logger);

  const app = Fastify({ logger: false, trustProxy: true });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: Number.isFinite(RATE_LIMIT_MAX) ? RATE_LIMIT_MAX : 120,
    timeWindow: process.env.TRACELENS_RATE_LIMIT_WINDOW ?? "1 minute",
    keyGenerator: (req) => rateLimitKeyFromRequest(req),
  });

  app.addHook(
    "preHandler",
    createAuthHook({
      platform,
      defaultProjectId: () => repo.defaultProjectId(),
      log: logger,
    }),
  );

  app.get("/health", async () => {
    let database: "ok" | "unavailable" = "ok";
    try {
      await pool.query("SELECT 1");
    } catch {
      database = "unavailable";
    }
    return {
      status: database === "ok" ? "ok" : "degraded",
      service: "tracelens-api",
      checks: { database },
      authMode: getAuthMode(),
    };
  });

  app.get(
    "/api/services",
    { preHandler: [requireRole("viewer")] },
    async (_req, reply) => {
      try {
        return await getServicesOverview(PROMETHEUS_URL);
      } catch (err) {
        logger.error({ err }, "failed to load services overview");
        return reply.code(200).send({
          services: [],
          summary: { healthy: 0, degraded: 0, critical: 0, unknown: 0 },
          generatedAt: new Date().toISOString(),
          backend: {
            prometheus: "unavailable",
            message: "Metrics backend temporarily unavailable.",
          },
        });
      }
    },
  );

  app.get(
    "/api/services/map",
    { preHandler: [requireRole("viewer")] },
    async () => getServiceMap(PROMETHEUS_URL),
  );

  app.get<{
    Querystring: {
      service?: string;
      minDuration?: string;
      status?: string;
      limit?: string;
    };
  }>(
    "/api/traces",
    { preHandler: [requireRole("viewer")] },
    async (req) => {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      return searchTraces(TEMPO_URL, {
        service: req.query.service,
        minDuration: req.query.minDuration,
        status: req.query.status,
        limit: Number.isFinite(limit) ? limit : 50,
      });
    },
  );

  app.get<{ Params: { traceId: string } }>(
    "/api/traces/:traceId",
    { preHandler: [requireRole("viewer")] },
    async (req, reply) => {
      const detail = await getTraceDetail(TEMPO_URL, req.params.traceId);
      if (detail.spans.length === 0 && detail.backend.tempo === "ok") {
        return reply.code(404).send({
          ...detail,
          backend: {
            tempo: "ok",
            message: "Trace not found",
          },
        });
      }
      return detail;
    },
  );

  app.get<{
    Querystring: {
      service?: string;
      level?: string;
      traceId?: string;
      q?: string;
      range?: string;
      limit?: string;
    };
  }>(
    "/api/logs",
    { preHandler: [requireRole("viewer")] },
    async (req) => {
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      return searchLogs(LOKI_URL, {
        service: req.query.service,
        level: req.query.level,
        traceId: req.query.traceId,
        q: req.query.q,
        range: req.query.range,
        limit: Number.isFinite(limit) ? limit : 100,
      });
    },
  );

  await registerAlertRoutes(app, { repo, platform, evaluator, log: logger });
  await registerIncidentRoutes(app, {
    incidents: incidentRepo,
    alerts: repo,
    platform,
    prometheusUrl: PROMETHEUS_URL,
    tempoUrl: TEMPO_URL,
    lokiUrl: LOKI_URL,
    paymentApiUrl: PAYMENT_API_URL,
    log: logger,
  });
  await registerPlatformRoutes(app, { platform });

  const scheduler = startAlertScheduler(evaluator, {
    intervalMs: Number.isFinite(ALERT_EVAL_INTERVAL_MS)
      ? ALERT_EVAL_INTERVAL_MS
      : 15_000,
    log: logger,
  });

  const shutdown = async () => {
    scheduler.stop();
    await app.close();
    await pool.end();
  };
  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  logger.info(
    {
      port: PORT,
      prometheusUrl: PROMETHEUS_URL,
      tempoUrl: TEMPO_URL,
      lokiUrl: LOKI_URL,
      databaseUrl: DATABASE_URL.replace(/:[^:@/]+@/, ":****@"),
      alertEvalIntervalMs: ALERT_EVAL_INTERVAL_MS,
      paymentApiUrl: PAYMENT_API_URL,
      authMode: getAuthMode(),
      rateLimitMax: RATE_LIMIT_MAX,
    },
    "tracelens-api listening",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
