import type { FastifyInstance } from "fastify";
import {
  AlertRepository,
  IncidentRepository,
  PlatformRepository,
  type IncidentDetailRow,
  type IncidentStatus,
} from "@tracelens/database";
import { z } from "zod";
import { audit, requireRole } from "../auth/middleware.js";
import { enrichIncident } from "./enrich.js";

const NoteSchema = z.object({
  note: z.string().trim().min(1).max(4000),
  actor: z.string().trim().min(1).max(80).optional(),
});

const AckSchema = z.object({
  actor: z.string().trim().min(1).max(80).optional(),
});

export async function registerIncidentRoutes(
  app: FastifyInstance,
  deps: {
    incidents: IncidentRepository;
    alerts: AlertRepository;
    platform: PlatformRepository;
    prometheusUrl: string;
    tempoUrl: string;
    lokiUrl: string;
    paymentApiUrl: string;
    log: {
      error: (obj: object, msg: string) => void;
      info: (obj: object, msg: string) => void;
    };
  },
): Promise<void> {
  const {
    incidents,
    alerts,
    platform,
    prometheusUrl,
    tempoUrl,
    lokiUrl,
    paymentApiUrl,
    log,
  } = deps;

  async function enrichOrIncident(incident: IncidentDetailRow) {
    try {
      return await enrichIncident(incident, {
        incidents,
        alerts,
        prometheusUrl,
        tempoUrl,
        lokiUrl,
      });
    } catch (err) {
      log.error(
        { err, incidentId: incident.id },
        "incident enrichment failed after mutation",
      );
      // Mutation already committed — do not surface enrichment failure as 500.
      return { incident, enrichmentFailed: true as const };
    }
  }

  app.get(
    "/api/incidents/summary",
    { preHandler: [requireRole("viewer")] },
    async (req) => incidents.summary(req.auth.projectId),
  );

  app.get<{
    Querystring: { status?: string; limit?: string };
  }>(
    "/api/incidents",
    { preHandler: [requireRole("viewer")] },
    async (req) => {
      const statusRaw = req.query.status;
      const status =
        statusRaw === "open" ||
        statusRaw === "acknowledged" ||
        statusRaw === "resolved" ||
        statusRaw === "active"
          ? (statusRaw as IncidentStatus | "active")
          : "active";
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const list = await incidents.listIncidents(req.auth.projectId, {
        status,
        limit: Number.isFinite(limit) ? limit : 50,
      });
      return {
        incidents: list,
        generatedAt: new Date().toISOString(),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/incidents/:id",
    { preHandler: [requireRole("viewer")] },
    async (req, reply) => {
      const incident = await incidents.getIncident(req.params.id);
      if (!incident || incident.projectId !== req.auth.projectId) {
        return reply.code(404).send({ error: "not_found" });
      }
      try {
        return await enrichIncident(incident, {
          incidents,
          alerts,
          prometheusUrl,
          tempoUrl,
          lokiUrl,
        });
      } catch (err) {
        log.error({ err, incidentId: incident.id }, "incident enrichment failed");
        return reply.code(500).send({ error: "enrichment_failed" });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/incidents/:id/acknowledge",
    { preHandler: [requireRole("operator")] },
    async (req, reply) => {
      const parsed = AckSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_failed",
          details: parsed.error.flatten(),
        });
      }
      const existing = await incidents.getIncident(req.params.id);
      if (!existing || existing.projectId !== req.auth.projectId) {
        return reply.code(404).send({ error: "not_found" });
      }
      const actor = parsed.data.actor ?? req.auth.actor;
      const updated = await incidents.acknowledge(req.params.id, actor);
      if (!updated) return reply.code(404).send({ error: "not_found" });
      await audit(platform, req, {
        action: "incident.acknowledge",
        resourceType: "incident",
        resourceId: updated.id,
      });
      return enrichOrIncident(updated);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/incidents/:id/resolve",
    { preHandler: [requireRole("operator")] },
    async (req, reply) => {
      const parsed = AckSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_failed",
          details: parsed.error.flatten(),
        });
      }
      const existing = await incidents.getIncident(req.params.id);
      if (!existing || existing.projectId !== req.auth.projectId) {
        return reply.code(404).send({ error: "not_found" });
      }
      const actor = parsed.data.actor ?? req.auth.actor;
      const updated = await incidents.resolve(req.params.id, actor);
      if (!updated) return reply.code(404).send({ error: "not_found" });
      await audit(platform, req, {
        action: "incident.resolve",
        resourceType: "incident",
        resourceId: updated.id,
      });
      return enrichOrIncident(updated);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/incidents/:id/notes",
    { preHandler: [requireRole("operator")] },
    async (req, reply) => {
      const parsed = NoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_failed",
          details: parsed.error.flatten(),
        });
      }
      const existing = await incidents.getIncident(req.params.id);
      if (!existing || existing.projectId !== req.auth.projectId) {
        return reply.code(404).send({ error: "not_found" });
      }
      const actor = parsed.data.actor ?? req.auth.actor;
      const updated = await incidents.addNote(
        req.params.id,
        parsed.data.note,
        actor,
      );
      if (!updated) return reply.code(404).send({ error: "not_found" });
      await audit(platform, req, {
        action: "incident.note",
        resourceType: "incident",
        resourceId: updated.id,
      });
      return enrichOrIncident(updated);
    },
  );

  app.get(
    "/api/deployments",
    { preHandler: [requireRole("viewer")] },
    async (req) => {
      const list = await incidents.listRecentDeployments(req.auth.projectId, 30);
      return { deployments: list, generatedAt: new Date().toISOString() };
    },
  );

  app.post(
    "/api/demo/simulate-incident",
    { preHandler: [requireRole("operator")] },
    async (req, reply) => {
      try {
        const res = await fetch(`${paymentApiUrl}/simulate-incident`, {
          method: "POST",
          signal: AbortSignal.timeout(5_000),
        });
        const body = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        if (!res.ok) {
          return reply.code(502).send({
            error: "simulate_failed",
            upstream: res.status,
          });
        }
        await audit(platform, req, {
          action: "demo.simulate_incident",
          resourceType: "demo",
          metadata: { enabled: true },
        });
        log.info({ paymentApiUrl }, "demo incident simulation enabled");
        return { ok: true, ...body };
      } catch (err) {
        log.error({ err }, "demo incident simulation failed");
        return reply.code(502).send({ error: "simulate_unreachable" });
      }
    },
  );

  app.delete(
    "/api/demo/simulate-incident",
    { preHandler: [requireRole("operator")] },
    async (req, reply) => {
      try {
        const res = await fetch(`${paymentApiUrl}/simulate-incident`, {
          method: "DELETE",
          signal: AbortSignal.timeout(5_000),
        });
        const body = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        if (!res.ok) {
          return reply.code(502).send({ error: "clear_failed" });
        }
        await audit(platform, req, {
          action: "demo.clear_simulate_incident",
          resourceType: "demo",
          metadata: { enabled: false },
        });
        return { ok: true, ...body };
      } catch (err) {
        log.error({ err }, "clear demo incident failed");
        return reply.code(502).send({ error: "simulate_unreachable" });
      }
    },
  );
}
