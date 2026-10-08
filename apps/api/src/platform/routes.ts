import type { FastifyInstance } from "fastify";
import {
  PlatformRepository,
  type ApiKeyRole,
} from "@tracelens/database";
import { z } from "zod";
import { audit, getAuthMode, requireRole } from "../auth/middleware.js";

const CreateKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(["viewer", "operator", "admin"]),
});

const SettingsPatchSchema = z.object({
  sampleErrorsPct: z.number().int().min(0).max(100).optional(),
  sampleSlowPct: z.number().int().min(0).max(100).optional(),
  sampleNormalPct: z.number().int().min(0).max(100).optional(),
  slowThresholdMs: z.number().int().min(100).max(60_000).optional(),
  retentionTracesHours: z.number().int().min(1).max(720).optional(),
  retentionLogsHours: z.number().int().min(1).max(2160).optional(),
  allowedMetricLabels: z.array(z.string().min(1).max(64)).max(40).optional(),
  forbiddenMetricLabels: z.array(z.string().min(1).max(64)).max(40).optional(),
});

export async function registerPlatformRoutes(
  app: FastifyInstance,
  deps: {
    platform: PlatformRepository;
  },
): Promise<void> {
  const { platform } = deps;

  // FIXME: sampling/retention PATCH values are stored in Postgres only — they do
  // not reload the Collector or Tempo/Loki configs. See docs/LIMITATIONS.md.

  app.get(
    "/api/platform/status",
    { preHandler: [requireRole("viewer")] },
    async (req) => {
      const settings = await platform.getSettings(req.auth.projectId);
      return {
        authMode: getAuthMode(),
        role: req.auth.role,
        actor: req.auth.actor,
        projectId: req.auth.projectId,
        sampling: settings
          ? {
              errorsPct: settings.sampleErrorsPct,
              slowPct: settings.sampleSlowPct,
              normalPct: settings.sampleNormalPct,
              slowThresholdMs: settings.slowThresholdMs,
            }
          : null,
        retention: settings
          ? {
              tracesHours: settings.retentionTracesHours,
              logsHours: settings.retentionLogsHours,
            }
          : null,
        cardinality: settings
          ? {
              allowed: settings.allowedMetricLabels,
              forbidden: settings.forbiddenMetricLabels,
            }
          : null,
        rateLimit: {
          max: Number(process.env.TRACELENS_RATE_LIMIT_MAX ?? 120),
          timeWindow: process.env.TRACELENS_RATE_LIMIT_WINDOW ?? "1 minute",
        },
        generatedAt: new Date().toISOString(),
      };
    },
  );

  app.get(
    "/api/platform/keys",
    { preHandler: [requireRole("admin")] },
    async (req) => {
      const keys = await platform.listApiKeys(req.auth.projectId);
      return { keys, generatedAt: new Date().toISOString() };
    },
  );

  app.post(
    "/api/platform/keys",
    { preHandler: [requireRole("admin")] },
    async (req, reply) => {
      const parsed = CreateKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_failed",
          details: parsed.error.flatten(),
        });
      }
      const created = await platform.createApiKey({
        projectId: req.auth.projectId,
        name: parsed.data.name,
        role: parsed.data.role as ApiKeyRole,
      });
      await audit(platform, req, {
        action: "api_key.create",
        resourceType: "api_key",
        resourceId: created.record.id,
        metadata: { name: created.record.name, role: created.record.role },
      });
      return reply.code(201).send({
        key: created.record,
        plaintext: created.plaintext,
        warning: "Store this key now — it will not be shown again.",
      });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/platform/keys/:id",
    { preHandler: [requireRole("admin")] },
    async (req, reply) => {
      const ok = await platform.revokeApiKey(req.params.id, req.auth.projectId);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      await audit(platform, req, {
        action: "api_key.revoke",
        resourceType: "api_key",
        resourceId: req.params.id,
      });
      return reply.code(204).send();
    },
  );

  app.get(
    "/api/platform/settings",
    { preHandler: [requireRole("viewer")] },
    async (req, reply) => {
      const settings = await platform.getSettings(req.auth.projectId);
      if (!settings) return reply.code(404).send({ error: "not_found" });
      return settings;
    },
  );

  app.patch(
    "/api/platform/settings",
    { preHandler: [requireRole("admin")] },
    async (req, reply) => {
      const parsed = SettingsPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_failed",
          details: parsed.error.flatten(),
        });
      }
      const updated = await platform.updateSettings(
        req.auth.projectId,
        parsed.data,
      );
      if (!updated) return reply.code(404).send({ error: "not_found" });
      await audit(platform, req, {
        action: "settings.update",
        resourceType: "project_settings",
        resourceId: req.auth.projectId,
        metadata: parsed.data,
      });
      return updated;
    },
  );

  app.get<{ Querystring: { limit?: string } }>(
    "/api/platform/audit",
    { preHandler: [requireRole("admin")] },
    async (req) => {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const entries = await platform.listAudit(
        req.auth.projectId,
        Number.isFinite(limit) ? limit : 50,
      );
      return { entries, generatedAt: new Date().toISOString() };
    },
  );

  app.get(
    "/api/platform/cardinality/check",
    { preHandler: [requireRole("viewer")] },
    async (req) => {
      const settings = await platform.getSettings(req.auth.projectId);
      const raw = (req.query as { labels?: string | string[] }).labels;
      const parts = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
      const labels = parts
        .flatMap((p) => String(p).split(","))
        .map((s) => s.trim())
        .filter(Boolean);

      const forbidden = new Set(
        (settings?.forbiddenMetricLabels ?? []).map((s) => s.toLowerCase()),
      );
      const allowed = new Set(
        (settings?.allowedMetricLabels ?? []).map((s) => s.toLowerCase()),
      );

      const results = labels.map((label) => {
        const lower = label.toLowerCase();
        if (forbidden.has(lower)) {
          return {
            label,
            status: "forbidden" as const,
            reason: "High-cardinality identifier — do not use as a metric label",
          };
        }
        if (allowed.size && !allowed.has(lower)) {
          return {
            label,
            status: "warn" as const,
            reason: "Not in allowlist — review before promoting to metrics",
          };
        }
        return { label, status: "ok" as const, reason: null };
      });

      return {
        results,
        allowlist: settings?.allowedMetricLabels ?? [],
        denylist: settings?.forbiddenMetricLabels ?? [],
      };
    },
  );
}
