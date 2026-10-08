import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  AlertRule,
  AlertState,
  Incident,
} from "@tracelens/database";
import { AlertEvaluator } from "./evaluator.js";
import type { PrometheusClient } from "../adapters/prometheus/client.js";

function rule(partial: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "rule-pay",
    projectId: "proj-1",
    name: "payment errors",
    description: "",
    metricType: "error_rate",
    service: "payment-api",
    comparator: "gt",
    threshold: 0.05,
    windowSeconds: 60,
    forSeconds: 30,
    severity: "critical",
    enabled: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

function state(partial: Partial<AlertState> = {}): AlertState {
  return {
    alertRuleId: "rule-pay",
    service: "payment-api",
    status: "ok",
    pendingSince: null,
    firingSince: null,
    lastValue: null,
    lastEvaluatedAt: null,
    lastError: null,
    openIncidentId: null,
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

type Upsert = {
  alertRuleId: string;
  service: string;
  status: AlertState["status"];
  pendingSince: Date | null;
  firingSince: Date | null;
  lastValue: number | null;
  lastError: string | null;
  openIncidentId: string | null;
};

function silentLog() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

function makeRepo(opts: {
  rules?: AlertRule[];
  states?: Map<string, AlertState>;
}) {
  const rules = opts.rules ?? [rule()];
  const states = opts.states ?? new Map<string, AlertState>();
  const upserts: Upsert[] = [];
  const opened: Array<{ service: string; title: string }> = [];
  const resolved: string[] = [];
  let incidentSeq = 0;

  const repo = {
    async listEnabledRules() {
      return rules;
    },
    async getState(ruleId: string, service: string) {
      return states.get(`${ruleId}:${service}`) ?? null;
    },
    async upsertState(input: Upsert) {
      upserts.push(input);
      states.set(`${input.alertRuleId}:${input.service}`, {
        alertRuleId: input.alertRuleId,
        service: input.service,
        status: input.status,
        pendingSince: input.pendingSince?.toISOString() ?? null,
        firingSince: input.firingSince?.toISOString() ?? null,
        lastValue: input.lastValue,
        lastEvaluatedAt: new Date().toISOString(),
        lastError: input.lastError,
        openIncidentId: input.openIncidentId,
        updatedAt: new Date().toISOString(),
      });
    },
    async openIncident(input: {
      projectId: string;
      alertRuleId: string;
      fingerprint: string;
      title: string;
      service: string;
      severity: AlertRule["severity"];
      affectedEndpoint: string | null;
    }): Promise<Incident> {
      incidentSeq += 1;
      const id = `inc-${incidentSeq}`;
      opened.push({ service: input.service, title: input.title });
      return {
        id,
        projectId: input.projectId,
        alertRuleId: input.alertRuleId,
        fingerprint: input.fingerprint,
        title: input.title,
        service: input.service,
        severity: input.severity,
        status: "open",
        startedAt: new Date().toISOString(),
        resolvedAt: null,
      };
    },
    async resolveIncident(id: string) {
      resolved.push(id);
    },
  };

  return { repo, upserts, opened, resolved, states };
}

function makePrometheus(opts: {
  ready?: boolean;
  samples?: Array<{ service: string; value: number }>;
}) {
  const client = {
    async ready() {
      return opts.ready ?? true;
    },
    async query() {
      return {
        status: "success",
        data: {
          resultType: "vector",
          result: (opts.samples ?? []).map((s) => ({
            metric: { service_name: s.service },
            value: [Date.now() / 1000, String(s.value)] as [number, string],
          })),
        },
      };
    },
  };
  return client as unknown as PrometheusClient;
}

describe("AlertEvaluator", () => {
  it("holds prior state when the series is missing", async () => {
    const { repo, upserts } = makeRepo({
      states: new Map([
        [
          "rule-pay:payment-api",
          state({
            status: "firing",
            lastValue: 0.2,
            openIncidentId: "inc-keep",
            firingSince: "2024-01-01T00:00:00.000Z",
          }),
        ],
      ]),
    });
    const evaluator = new AlertEvaluator(
      repo as never,
      makePrometheus({ samples: [] }),
      silentLog(),
    );

    const cycle = await evaluator.runOnce();
    const result = cycle.results.find((r) => r.service === "payment-api");
    assert.ok(result);
    assert.equal(result.status, "firing");
    assert.equal(result.error, "no_data");
    assert.equal(result.incidentId, "inc-keep");
    assert.equal(upserts.at(-1)?.status, "firing");
    assert.equal(upserts.at(-1)?.openIncidentId, "inc-keep");
    assert.match(upserts.at(-1)?.lastError ?? "", /No metric samples/);
  });

  it("stays pending until the FOR window elapses, then opens an incident", async () => {
    const pendingSince = new Date(Date.now() - 5_000).toISOString();
    const early = makeRepo({
      states: new Map([
        [
          "rule-pay:payment-api",
          state({ status: "pending", pendingSince, lastValue: 0.1 }),
        ],
      ]),
    });
    const earlyEval = new AlertEvaluator(
      early.repo as never,
      makePrometheus({ samples: [{ service: "payment-api", value: 0.2 }] }),
      silentLog(),
    );
    const earlyCycle = await earlyEval.runOnce();
    assert.equal(earlyCycle.results[0]?.status, "pending");
    assert.equal(early.opened.length, 0);

    const readySince = new Date(Date.now() - 45_000).toISOString();
    const late = makeRepo({
      states: new Map([
        [
          "rule-pay:payment-api",
          state({ status: "pending", pendingSince: readySince, lastValue: 0.1 }),
        ],
      ]),
    });
    const lateEval = new AlertEvaluator(
      late.repo as never,
      makePrometheus({ samples: [{ service: "payment-api", value: 0.2 }] }),
      silentLog(),
    );
    const lateCycle = await lateEval.runOnce();
    assert.equal(lateCycle.results[0]?.status, "firing");
    assert.equal(late.opened.length, 1);
    assert.ok(lateCycle.results[0]?.incidentId);
  });

  it("fires immediately when forSeconds is 0", async () => {
    const { repo, opened } = makeRepo({
      rules: [rule({ forSeconds: 0 })],
    });
    const evaluator = new AlertEvaluator(
      repo as never,
      makePrometheus({ samples: [{ service: "payment-api", value: 0.2 }] }),
      silentLog(),
    );
    const cycle = await evaluator.runOnce();
    assert.equal(cycle.results[0]?.status, "firing");
    assert.equal(opened.length, 1);
  });

  it("resolves an open incident when the condition clears", async () => {
    const { repo, resolved, upserts } = makeRepo({
      states: new Map([
        [
          "rule-pay:payment-api",
          state({
            status: "firing",
            lastValue: 0.2,
            openIncidentId: "inc-1",
            firingSince: "2024-01-01T00:00:00.000Z",
          }),
        ],
      ]),
    });
    const evaluator = new AlertEvaluator(
      repo as never,
      makePrometheus({ samples: [{ service: "payment-api", value: 0.01 }] }),
      silentLog(),
    );
    const cycle = await evaluator.runOnce();
    assert.equal(cycle.results[0]?.status, "ok");
    assert.equal(cycle.results[0]?.incidentId, null);
    assert.deepEqual(resolved, ["inc-1"]);
    assert.equal(upserts.at(-1)?.openIncidentId, null);
  });

  it("skips evaluation but preserves state when Prometheus is down", async () => {
    const { repo, upserts } = makeRepo({
      states: new Map([
        [
          "rule-pay:payment-api",
          state({
            status: "pending",
            lastValue: 0.12,
            pendingSince: "2024-01-01T00:00:00.000Z",
          }),
        ],
      ]),
    });
    const evaluator = new AlertEvaluator(
      repo as never,
      makePrometheus({ ready: false }),
      silentLog(),
    );
    const cycle = await evaluator.runOnce();
    assert.ok(cycle.errors.includes("Prometheus unavailable"));
    assert.equal(cycle.results[0]?.status, "pending");
    assert.equal(upserts.at(-1)?.status, "pending");
    assert.match(upserts.at(-1)?.lastError ?? "", /Prometheus unavailable/);
  });
});
