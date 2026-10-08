import {
  AlertRepository,
  AFFECTED_ENDPOINTS,
  type AlertRule,
  type AlertStateStatus,
} from "@tracelens/database";
import { PrometheusClient } from "../adapters/prometheus/client.js";
import {
  buildAlertPromqlCandidates,
  compareValue,
  fingerprint,
  formatMetricValue,
  type MetricSample,
} from "./promql.js";

export interface EvaluationResult {
  ruleId: string;
  ruleName: string;
  service: string;
  previousStatus: AlertStateStatus;
  status: AlertStateStatus;
  value: number | null;
  conditionMet: boolean;
  incidentId: string | null;
  error: string | null;
}

export interface EvaluationCycleResult {
  evaluatedAt: string;
  results: EvaluationResult[];
  errors: string[];
}

const KNOWN_SERVICES = [
  "shop-api",
  "product-api",
  "order-api",
  "payment-api",
  "notification-worker",
];

export class AlertEvaluator {
  constructor(
    private readonly repo: AlertRepository,
    private readonly prometheus: PrometheusClient,
    private readonly log: {
      info: (obj: object, msg: string) => void;
      warn: (obj: object, msg: string) => void;
      error: (obj: object, msg: string) => void;
    },
  ) {}

  async runOnce(): Promise<EvaluationCycleResult> {
    const evaluatedAt = new Date().toISOString();
    const results: EvaluationResult[] = [];
    const errors: string[] = [];

    let rules: AlertRule[] = [];
    try {
      rules = await this.repo.listEnabledRules();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`failed to load rules: ${message}`);
      return { evaluatedAt, results, errors };
    }

    const ready = await this.prometheus.ready();
    if (!ready) {
      for (const rule of rules) {
        const services = rule.service ? [rule.service] : KNOWN_SERVICES;
        for (const service of services) {
          const previous = await this.repo.getState(rule.id, service);
          await this.repo.upsertState({
            alertRuleId: rule.id,
            service,
            status: previous?.status ?? "ok",
            pendingSince: previous?.pendingSince
              ? new Date(previous.pendingSince)
              : null,
            firingSince: previous?.firingSince
              ? new Date(previous.firingSince)
              : null,
            lastValue: previous?.lastValue ?? null,
            lastError: "Prometheus unavailable — evaluation skipped",
            openIncidentId: previous?.openIncidentId ?? null,
          });
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            service,
            previousStatus: previous?.status ?? "ok",
            status: previous?.status ?? "ok",
            value: previous?.lastValue ?? null,
            conditionMet: false,
            incidentId: previous?.openIncidentId ?? null,
            error: "Prometheus unavailable",
          });
        }
      }
      errors.push("Prometheus unavailable");
      return { evaluatedAt, results, errors };
    }

    for (const rule of rules) {
      try {
        const samples = await this.querySamples(rule);
        const expected = rule.service ? [rule.service] : KNOWN_SERVICES;
        const byService = new Map(samples.map((s) => [s.service, s.value]));
        // Always evaluate every expected service. Partial Prometheus results must
        // not leave missing services with untouched firing/pending state.
        const targets: MetricSample[] = expected.map((service) => ({
          service,
          value: byService.has(service) ? byService.get(service)! : Number.NaN,
        }));
        for (const [service, value] of byService) {
          if (!expected.includes(service)) {
            targets.push({ service, value });
          }
        }

        for (const sample of targets) {
          const result = await this.evaluateSample(rule, sample);
          results.push(result);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log.error({ err, ruleId: rule.id }, "alert rule evaluation failed");
        errors.push(`${rule.name}: ${message}`);
        // Match normal evaluation: write per-service state so UI/summaries see errors.
        const services = rule.service ? [rule.service] : KNOWN_SERVICES;
        for (const service of services) {
          const previous = await this.repo.getState(rule.id, service);
          await this.repo.upsertState({
            alertRuleId: rule.id,
            service,
            status: previous?.status ?? "ok",
            pendingSince: previous?.pendingSince
              ? new Date(previous.pendingSince)
              : null,
            firingSince: previous?.firingSince
              ? new Date(previous.firingSince)
              : null,
            lastValue: previous?.lastValue ?? null,
            lastError: message,
            openIncidentId: previous?.openIncidentId ?? null,
          });
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            service,
            previousStatus: previous?.status ?? "ok",
            status: previous?.status ?? "ok",
            value: previous?.lastValue ?? null,
            conditionMet: false,
            incidentId: previous?.openIncidentId ?? null,
            error: message,
          });
        }
      }
    }

    return { evaluatedAt, results, errors };
  }

  private async querySamples(rule: AlertRule): Promise<MetricSample[]> {
    // Try each PromQL shape (ms vs s histograms, status label variants) like the
    // services dashboard — first non-empty result wins.
    for (const promql of buildAlertPromqlCandidates(rule)) {
      try {
        const result = await this.prometheus.query(promql);
        const samples: MetricSample[] = [];
        for (const row of result.data?.result ?? []) {
          const service = row.metric.service_name;
          if (!service || !row.value) continue;
          if (rule.service && service !== rule.service) continue;
          const value = Number(row.value[1]);
          if (!Number.isFinite(value)) continue;
          samples.push({ service, value });
        }
        if (samples.length > 0) return samples;
      } catch {
        // try next metric/label shape
      }
    }
    return [];
  }

  private async evaluateSample(
    rule: AlertRule,
    sample: MetricSample,
  ): Promise<EvaluationResult> {
    const now = new Date();
    const previous = await this.repo.getState(rule.id, sample.service);
    const previousStatus = previous?.status ?? "ok";

    // Missing series: hold prior state (do not auto-resolve on scrape gaps).
    if (!Number.isFinite(sample.value)) {
      await this.repo.upsertState({
        alertRuleId: rule.id,
        service: sample.service,
        status: previousStatus,
        pendingSince: previous?.pendingSince
          ? new Date(previous.pendingSince)
          : null,
        firingSince: previous?.firingSince
          ? new Date(previous.firingSince)
          : null,
        lastValue: previous?.lastValue ?? null,
        lastError: "No metric samples for evaluation window",
        openIncidentId: previous?.openIncidentId ?? null,
      });
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        service: sample.service,
        previousStatus,
        status: previousStatus,
        value: previous?.lastValue ?? null,
        conditionMet: false,
        incidentId: previous?.openIncidentId ?? null,
        error: "no_data",
      };
    }

    const conditionMet = compareValue(
      sample.value,
      rule.comparator,
      rule.threshold,
    );

    let status: AlertStateStatus = "ok";
    let pendingSince: Date | null = null;
    let firingSince: Date | null = null;
    let openIncidentId = previous?.openIncidentId ?? null;
    let incidentId: string | null = openIncidentId;

    if (!conditionMet) {
      status = "ok";
      if (previousStatus === "firing" && openIncidentId) {
        await this.repo.resolveIncident(openIncidentId);
        this.log.info(
          {
            ruleId: rule.id,
            service: sample.service,
            incidentId: openIncidentId,
          },
          "alert resolved",
        );
      }
      openIncidentId = null;
      incidentId = null;
    } else if (rule.forSeconds <= 0) {
      status = "firing";
      firingSince = previous?.firingSince
        ? new Date(previous.firingSince)
        : now;
      if (previousStatus !== "firing") {
        const incident = await this.repo.openIncident({
          projectId: rule.projectId,
          alertRuleId: rule.id,
          fingerprint: fingerprint(rule.id, sample.service),
          title: `${rule.name} (${sample.service})`,
          service: sample.service,
          severity: rule.severity,
          affectedEndpoint: AFFECTED_ENDPOINTS[sample.service] ?? null,
        });
        openIncidentId = incident.id;
        incidentId = incident.id;
        this.log.warn(
          {
            ruleId: rule.id,
            service: sample.service,
            value: sample.value,
            threshold: rule.threshold,
            incidentId,
          },
          "alert firing",
        );
      }
    } else {
      // FOR window > 0
      if (previousStatus === "firing") {
        status = "firing";
        firingSince = previous?.firingSince
          ? new Date(previous.firingSince)
          : now;
        pendingSince = previous?.pendingSince
          ? new Date(previous.pendingSince)
          : now;
      } else {
        const started =
          previousStatus === "pending" && previous?.pendingSince
            ? new Date(previous.pendingSince)
            : now;
        pendingSince = started;
        const elapsedMs = now.getTime() - started.getTime();
        if (elapsedMs >= rule.forSeconds * 1000) {
          status = "firing";
          firingSince = now;
          const incident = await this.repo.openIncident({
            projectId: rule.projectId,
            alertRuleId: rule.id,
            fingerprint: fingerprint(rule.id, sample.service),
            title: `${rule.name} (${sample.service}: ${formatMetricValue(rule.metricType, sample.value)})`,
            service: sample.service,
            severity: rule.severity,
            affectedEndpoint: AFFECTED_ENDPOINTS[sample.service] ?? null,
          });
          openIncidentId = incident.id;
          incidentId = incident.id;
          this.log.warn(
            {
              ruleId: rule.id,
              service: sample.service,
              value: sample.value,
              forSeconds: rule.forSeconds,
              incidentId,
            },
            "alert firing after FOR window",
          );
        } else {
          status = "pending";
        }
      }
    }

    await this.repo.upsertState({
      alertRuleId: rule.id,
      service: sample.service,
      status,
      pendingSince,
      firingSince,
      lastValue: Number.isFinite(sample.value) ? sample.value : null,
      lastError: null,
      openIncidentId,
    });

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      service: sample.service,
      previousStatus,
      status,
      value: Number.isFinite(sample.value) ? sample.value : null,
      conditionMet,
      incidentId,
      error: null,
    };
  }
}

export function startAlertScheduler(
  evaluator: AlertEvaluator,
  opts: {
    intervalMs: number;
    log: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };
  },
): { stop: () => void } {
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const cycle = await evaluator.runOnce();
      const firing = cycle.results.filter((r) => r.status === "firing").length;
      const pending = cycle.results.filter((r) => r.status === "pending").length;
      opts.log.info(
        {
          evaluated: cycle.results.length,
          firing,
          pending,
          errors: cycle.errors.length,
        },
        "alert evaluation cycle complete",
      );
    } catch (err) {
      opts.log.error({ err }, "alert evaluation cycle crashed");
    } finally {
      running = false;
    }
  };

  void tick();
  const handle = setInterval(() => {
    void tick();
  }, opts.intervalMs);

  return {
    stop: () => {
      stopped = true;
      clearInterval(handle);
    },
  };
}
