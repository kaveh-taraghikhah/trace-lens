import type { FastifyInstance } from "fastify";
import {
  AlertRepository,
  PlatformRepository,
  type AlertRuleWithStates,
} from "@tracelens/database";
import { audit, requireRole } from "../auth/middleware.js";
import type { AlertEvaluator } from "./evaluator.js";
import { CreateAlertRuleSchema, UpdateAlertRuleSchema } from "./schemas.js";
import { buildAlertPromql, formatMetricValue } from "./promql.js";

function presentRule(rule: AlertRuleWithStates) {
  return {
    ...rule,
    promql: buildAlertPromql(rule),
    states: rule.states.map((s) => ({
      ...s,
      lastValueFormatted:
        s.lastValue === null
          ? null
          : formatMetricValue(rule.metricType, s.lastValue),
    })),
  };
}

export async function registerAlertRoutes(
  app: FastifyInstance,
  deps: {
    repo: AlertRepository;
    platform: PlatformRepository;
    evaluator: AlertEvaluator;
    log: { error: (obj: object, msg: string) => void };
  },
): Promise<void> {
  const { repo, platform, evaluator, log } = deps;

  app.get(
    "/api/alerts/summary",
    { preHandler: [requireRole("viewer")] },
    async (req) => repo.summary(req.auth.projectId),
  );

  app.get(
    "/api/alerts/incidents",
    { preHandler: [requireRole("viewer")] },
    async (req) => {
      const incidents = await repo.listOpenIncidents(req.auth.projectId);
      return { incidents, generatedAt: new Date().toISOString() };
    },
  );

  app.get(
    "/api/alerts/rules",
    { preHandler: [requireRole("viewer")] },
    async (req) => {
      const rules = await repo.listRules(req.auth.projectId);
      return {
        rules: rules.map(presentRule),
        generatedAt: new Date().toISOString(),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/alerts/rules/:id",
    { preHandler: [requireRole("viewer")] },
    async (req, reply) => {
      const rule = await repo.getRule(req.params.id);
      if (!rule || rule.projectId !== req.auth.projectId) {
        return reply.code(404).send({ error: "not_found" });
      }
      return presentRule(rule);
    },
  );

  app.post(
    "/api/alerts/rules",
    { preHandler: [requireRole("operator")] },
    async (req, reply) => {
      const parsed = CreateAlertRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_failed",
          details: parsed.error.flatten(),
        });
      }
      const rule = await repo.createRule({
        projectId: req.auth.projectId,
        ...parsed.data,
        service: parsed.data.service,
      });
      await audit(platform, req, {
        action: "alert_rule.create",
        resourceType: "alert_rule",
        resourceId: rule.id,
        metadata: { name: rule.name },
      });
      return reply.code(201).send(presentRule({ ...rule, states: [] }));
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/api/alerts/rules/:id",
    { preHandler: [requireRole("operator")] },
    async (req, reply) => {
      const parsed = UpdateAlertRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_failed",
          details: parsed.error.flatten(),
        });
      }
      const existing = await repo.getRule(req.params.id);
      if (!existing || existing.projectId !== req.auth.projectId) {
        return reply.code(404).send({ error: "not_found" });
      }
      const updated = await repo.updateRule(req.params.id, parsed.data);
      if (!updated) return reply.code(404).send({ error: "not_found" });
      if (existing.enabled !== updated.enabled) {
        await repo.clearEvaluationState(updated.id);
      }
      await audit(platform, req, {
        action: "alert_rule.update",
        resourceType: "alert_rule",
        resourceId: updated.id,
      });
      const full = await repo.getRule(updated.id);
      return presentRule(full!);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/alerts/rules/:id",
    { preHandler: [requireRole("admin")] },
    async (req, reply) => {
      const existing = await repo.getRule(req.params.id);
      if (!existing || existing.projectId !== req.auth.projectId) {
        return reply.code(404).send({ error: "not_found" });
      }
      const ok = await repo.deleteRule(req.params.id);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      await audit(platform, req, {
        action: "alert_rule.delete",
        resourceType: "alert_rule",
        resourceId: req.params.id,
      });
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/alerts/rules/:id/enable",
    { preHandler: [requireRole("operator")] },
    async (req, reply) => {
      const existing = await repo.getRule(req.params.id);
      if (!existing || existing.projectId !== req.auth.projectId) {
        return reply.code(404).send({ error: "not_found" });
      }
      const updated = await repo.updateRule(req.params.id, { enabled: true });
      if (!updated) return reply.code(404).send({ error: "not_found" });
      await repo.clearEvaluationState(updated.id);
      await audit(platform, req, {
        action: "alert_rule.enable",
        resourceType: "alert_rule",
        resourceId: updated.id,
      });
      const full = await repo.getRule(updated.id);
      return presentRule(full!);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/alerts/rules/:id/disable",
    { preHandler: [requireRole("operator")] },
    async (req, reply) => {
      const existing = await repo.getRule(req.params.id);
      if (!existing || existing.projectId !== req.auth.projectId) {
        return reply.code(404).send({ error: "not_found" });
      }
      const updated = await repo.updateRule(req.params.id, { enabled: false });
      if (!updated) return reply.code(404).send({ error: "not_found" });
      await repo.clearEvaluationState(updated.id);
      await audit(platform, req, {
        action: "alert_rule.disable",
        resourceType: "alert_rule",
        resourceId: updated.id,
      });
      const full = await repo.getRule(updated.id);
      return presentRule(full!);
    },
  );

  app.post(
    "/api/alerts/evaluate",
    { preHandler: [requireRole("operator")] },
    async (req, reply) => {
      try {
        const cycle = await evaluator.runOnce();
        await audit(platform, req, {
          action: "alert.evaluate",
          resourceType: "alert_evaluator",
          metadata: { evaluated: cycle.results.length },
        });
        return cycle;
      } catch (err) {
        log.error({ err }, "manual alert evaluation failed");
        return reply.code(500).send({ error: "evaluation_failed" });
      }
    },
  );
}
