export type AlertMetricType =
  | "error_rate"
  | "p95_latency"
  | "request_rate"
  | "request_rate_drop";

export type AlertComparator = "gt" | "lt";
export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStateStatus = "ok" | "pending" | "firing";
export type IncidentStatus = "open" | "acknowledged" | "resolved";

export interface AlertRule {
  id: string;
  projectId: string;
  name: string;
  description: string;
  metricType: AlertMetricType;
  service: string | null;
  comparator: AlertComparator;
  threshold: number;
  windowSeconds: number;
  forSeconds: number;
  severity: AlertSeverity;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertState {
  alertRuleId: string;
  service: string;
  status: AlertStateStatus;
  pendingSince: string | null;
  firingSince: string | null;
  lastValue: number | null;
  lastEvaluatedAt: string | null;
  lastError: string | null;
  openIncidentId: string | null;
  updatedAt: string;
}

export interface Incident {
  id: string;
  projectId: string;
  alertRuleId: string;
  fingerprint: string;
  title: string;
  service: string;
  severity: AlertSeverity;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt: string | null;
}

export interface AlertRuleWithStates extends AlertRule {
  states: AlertState[];
}

type RuleRow = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  metric_type: AlertMetricType;
  service: string | null;
  comparator: AlertComparator;
  threshold: number;
  window_seconds: number;
  for_seconds: number;
  severity: AlertSeverity;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

type StateRow = {
  alert_rule_id: string;
  service: string;
  status: AlertStateStatus;
  pending_since: Date | null;
  firing_since: Date | null;
  last_value: number | null;
  last_evaluated_at: Date | null;
  last_error: string | null;
  open_incident_id: string | null;
  updated_at: Date;
};

type IncidentRow = {
  id: string;
  project_id: string;
  alert_rule_id: string;
  fingerprint: string;
  title: string;
  service: string;
  severity: AlertSeverity;
  status: IncidentStatus;
  started_at: Date;
  resolved_at: Date | null;
};

function mapRule(row: RuleRow): AlertRule {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    metricType: row.metric_type,
    service: row.service,
    comparator: row.comparator,
    threshold: Number(row.threshold),
    windowSeconds: row.window_seconds,
    forSeconds: row.for_seconds,
    severity: row.severity,
    enabled: row.enabled,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapState(row: StateRow): AlertState {
  return {
    alertRuleId: row.alert_rule_id,
    service: row.service,
    status: row.status,
    pendingSince: row.pending_since?.toISOString() ?? null,
    firingSince: row.firing_since?.toISOString() ?? null,
    lastValue: row.last_value === null ? null : Number(row.last_value),
    lastEvaluatedAt: row.last_evaluated_at?.toISOString() ?? null,
    lastError: row.last_error,
    openIncidentId: row.open_incident_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    projectId: row.project_id,
    alertRuleId: row.alert_rule_id,
    fingerprint: row.fingerprint,
    title: row.title,
    service: row.service,
    severity: row.severity,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
  };
}

import type pg from "pg";

export class AlertRepository {
  constructor(private readonly pool: pg.Pool) {}

  async listRules(projectId: string): Promise<AlertRuleWithStates[]> {
    const rules = await this.pool.query<RuleRow>(
      `SELECT * FROM alert_rules WHERE project_id = $1 ORDER BY created_at ASC`,
      [projectId],
    );
    const states = await this.pool.query<StateRow>(
      `SELECT s.* FROM alert_states s
       INNER JOIN alert_rules r ON r.id = s.alert_rule_id
       WHERE r.project_id = $1`,
      [projectId],
    );
    const byRule = new Map<string, AlertState[]>();
    for (const row of states.rows) {
      const list = byRule.get(row.alert_rule_id) ?? [];
      list.push(mapState(row));
      byRule.set(row.alert_rule_id, list);
    }
    return rules.rows.map((r) => ({
      ...mapRule(r),
      states: byRule.get(r.id) ?? [],
    }));
  }

  async getRule(id: string): Promise<AlertRuleWithStates | null> {
    const rules = await this.pool.query<RuleRow>(
      `SELECT * FROM alert_rules WHERE id = $1`,
      [id],
    );
    if (rules.rowCount === 0) return null;
    const states = await this.pool.query<StateRow>(
      `SELECT * FROM alert_states WHERE alert_rule_id = $1`,
      [id],
    );
    return {
      ...mapRule(rules.rows[0]!),
      states: states.rows.map(mapState),
    };
  }

  async createRule(
    input: Omit<AlertRule, "id" | "createdAt" | "updatedAt">,
  ): Promise<AlertRule> {
    const result = await this.pool.query<RuleRow>(
      `INSERT INTO alert_rules (
         project_id, name, description, metric_type, service,
         comparator, threshold, window_seconds, for_seconds, severity, enabled
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        input.projectId,
        input.name,
        input.description,
        input.metricType,
        input.service,
        input.comparator,
        input.threshold,
        input.windowSeconds,
        input.forSeconds,
        input.severity,
        input.enabled,
      ],
    );
    return mapRule(result.rows[0]!);
  }

  async updateRule(
    id: string,
    patch: Partial<
      Omit<AlertRule, "id" | "projectId" | "createdAt" | "updatedAt">
    >,
  ): Promise<AlertRule | null> {
    const current = await this.getRule(id);
    if (!current) return null;

    const next = {
      name: patch.name ?? current.name,
      description: patch.description ?? current.description,
      metricType: patch.metricType ?? current.metricType,
      service: patch.service !== undefined ? patch.service : current.service,
      comparator: patch.comparator ?? current.comparator,
      threshold: patch.threshold ?? current.threshold,
      windowSeconds: patch.windowSeconds ?? current.windowSeconds,
      forSeconds: patch.forSeconds ?? current.forSeconds,
      severity: patch.severity ?? current.severity,
      enabled: patch.enabled ?? current.enabled,
    };

    const result = await this.pool.query<RuleRow>(
      `UPDATE alert_rules SET
         name = $2,
         description = $3,
         metric_type = $4,
         service = $5,
         comparator = $6,
         threshold = $7,
         window_seconds = $8,
         for_seconds = $9,
         severity = $10,
         enabled = $11,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        next.name,
        next.description,
        next.metricType,
        next.service,
        next.comparator,
        next.threshold,
        next.windowSeconds,
        next.forSeconds,
        next.severity,
        next.enabled,
      ],
    );
    return mapRule(result.rows[0]!);
  }

  async deleteRule(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM alert_rules WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listEnabledRules(): Promise<AlertRule[]> {
    const result = await this.pool.query<RuleRow>(
      `SELECT * FROM alert_rules WHERE enabled = TRUE ORDER BY created_at ASC`,
    );
    return result.rows.map(mapRule);
  }

  async getState(
    alertRuleId: string,
    service: string,
  ): Promise<AlertState | null> {
    const result = await this.pool.query<StateRow>(
      `SELECT * FROM alert_states WHERE alert_rule_id = $1 AND service = $2`,
      [alertRuleId, service],
    );
    return result.rowCount ? mapState(result.rows[0]!) : null;
  }

  async upsertState(state: {
    alertRuleId: string;
    service: string;
    status: AlertStateStatus;
    pendingSince: Date | null;
    firingSince: Date | null;
    lastValue: number | null;
    lastError: string | null;
    openIncidentId: string | null;
  }): Promise<AlertState> {
    const result = await this.pool.query<StateRow>(
      `INSERT INTO alert_states (
         alert_rule_id, service, status, pending_since, firing_since,
         last_value, last_evaluated_at, last_error, open_incident_id, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,NOW())
       ON CONFLICT (alert_rule_id, service) DO UPDATE SET
         status = EXCLUDED.status,
         pending_since = EXCLUDED.pending_since,
         firing_since = EXCLUDED.firing_since,
         last_value = EXCLUDED.last_value,
         last_evaluated_at = NOW(),
         last_error = EXCLUDED.last_error,
         open_incident_id = EXCLUDED.open_incident_id,
         updated_at = NOW()
       RETURNING *`,
      [
        state.alertRuleId,
        state.service,
        state.status,
        state.pendingSince,
        state.firingSince,
        state.lastValue,
        state.lastError,
        state.openIncidentId,
      ],
    );
    return mapState(result.rows[0]!);
  }

  /**
   * Clear pending/firing clocks when a rule is disabled/re-enabled so the FOR
   * window cannot be inherited. Also resolves linked open incidents so they are
   * not orphaned when open_incident_id is cleared.
   */
  async clearEvaluationState(alertRuleId: string): Promise<void> {
    const linked = await this.pool.query<{ id: string }>(
      `SELECT DISTINCT id FROM (
         SELECT i.id
         FROM incidents i
         WHERE i.alert_rule_id = $1
           AND i.status IN ('open', 'acknowledged')
         UNION
         SELECT s.open_incident_id AS id
         FROM alert_states s
         WHERE s.alert_rule_id = $1
           AND s.open_incident_id IS NOT NULL
       ) linked`,
      [alertRuleId],
    );
    for (const row of linked.rows) {
      await this.resolveIncident(
        row.id,
        "Resolved: alert rule disabled or evaluation state reset",
      );
    }

    await this.pool.query(
      `UPDATE alert_states SET
         status = 'ok',
         pending_since = NULL,
         firing_since = NULL,
         open_incident_id = NULL,
         updated_at = NOW()
       WHERE alert_rule_id = $1`,
      [alertRuleId],
    );
  }

  async openIncident(input: {
    projectId: string;
    alertRuleId: string;
    fingerprint: string;
    title: string;
    service: string;
    severity: AlertSeverity;
    affectedEndpoint?: string | null;
  }): Promise<Incident> {
    const result = await this.pool.query<IncidentRow>(
      `INSERT INTO incidents (
         project_id, alert_rule_id, fingerprint, title, service, severity, status,
         affected_endpoint
       ) VALUES ($1,$2,$3,$4,$5,$6,'open',$7)
       ON CONFLICT (project_id, fingerprint) DO UPDATE SET
         status = CASE
           WHEN incidents.status = 'resolved' THEN 'open'
           ELSE incidents.status
         END,
         resolved_at = CASE
           WHEN incidents.status = 'resolved' THEN NULL
           ELSE incidents.resolved_at
         END,
         title = EXCLUDED.title,
         severity = EXCLUDED.severity,
         affected_endpoint = COALESCE(EXCLUDED.affected_endpoint, incidents.affected_endpoint),
         started_at = CASE
           WHEN incidents.status = 'resolved' THEN NOW()
           ELSE incidents.started_at
         END
       RETURNING *`,
      [
        input.projectId,
        input.alertRuleId,
        input.fingerprint,
        input.title,
        input.service,
        input.severity,
        input.affectedEndpoint ?? null,
      ],
    );
    const incident = mapIncident(result.rows[0]!);

    await this.pool.query(
      `INSERT INTO incident_events (incident_id, kind, message, actor)
       SELECT $1, 'opened', $2, 'system'
       WHERE NOT EXISTS (
         SELECT 1 FROM incident_events
         WHERE incident_id = $1 AND kind = 'opened'
       )`,
      [incident.id, `Incident opened: ${input.title}`],
    );

    return incident;
  }

  async listOpenIncidents(projectId: string): Promise<Incident[]> {
    const result = await this.pool.query<IncidentRow>(
      `SELECT * FROM incidents
       WHERE project_id = $1 AND status = 'open'
       ORDER BY started_at DESC
       LIMIT 100`,
      [projectId],
    );
    return result.rows.map(mapIncident);
  }

  async resolveIncident(
    id: string,
    message = "Auto-resolved: alert condition cleared",
  ): Promise<void> {
    await this.pool.query(
      `UPDATE incidents SET status = 'resolved', resolved_at = NOW()
       WHERE id = $1 AND status IN ('open', 'acknowledged')`,
      [id],
    );
    await this.pool.query(
      `INSERT INTO incident_events (incident_id, kind, message, actor)
       SELECT $1, 'resolved', $2, 'system'
       WHERE EXISTS (SELECT 1 FROM incidents WHERE id = $1 AND status = 'resolved')
         AND NOT EXISTS (
           SELECT 1 FROM incident_events
           WHERE incident_id = $1 AND kind = 'resolved'
             AND created_at > NOW() - INTERVAL '30 seconds'
         )`,
      [id, message],
    );
  }

  async defaultProjectId(): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM projects WHERE slug = 'ecommerce-demo' LIMIT 1`,
    );
    if (!result.rowCount) {
      throw new Error("Default project ecommerce-demo not found — run migrations");
    }
    return result.rows[0]!.id;
  }

  async summary(projectId: string): Promise<{
    rules: number;
    enabled: number;
    firing: number;
    pending: number;
    openIncidents: number;
  }> {
    const rules = await this.pool.query<{
      total: string;
      enabled: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE enabled)::text AS enabled
       FROM alert_rules WHERE project_id = $1`,
      [projectId],
    );
    const states = await this.pool.query<{
      firing: string;
      pending: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE s.status = 'firing')::text AS firing,
         COUNT(*) FILTER (WHERE s.status = 'pending')::text AS pending
       FROM alert_states s
       INNER JOIN alert_rules r ON r.id = s.alert_rule_id
       WHERE r.project_id = $1`,
      [projectId],
    );
    const incidents = await this.pool.query<{ open: string }>(
      `SELECT COUNT(*)::text AS open FROM incidents
       WHERE project_id = $1 AND status IN ('open', 'acknowledged')`,
      [projectId],
    );
    return {
      rules: Number(rules.rows[0]?.total ?? 0),
      enabled: Number(rules.rows[0]?.enabled ?? 0),
      firing: Number(states.rows[0]?.firing ?? 0),
      pending: Number(states.rows[0]?.pending ?? 0),
      openIncidents: Number(incidents.rows[0]?.open ?? 0),
    };
  }
}
