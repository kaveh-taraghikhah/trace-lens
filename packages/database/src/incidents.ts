import type pg from "pg";
import type { AlertSeverity, IncidentStatus } from "./alerts.js";

export type IncidentEventKind =
  | "opened"
  | "acknowledged"
  | "resolved"
  | "note"
  | "severity_changed"
  | "enriched";

export interface IncidentEvent {
  id: string;
  incidentId: string;
  kind: IncidentEventKind;
  message: string;
  actor: string | null;
  createdAt: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  service: string;
  version: string;
  environment: string;
  deployedAt: string;
  metadata: Record<string, unknown>;
}

export interface IncidentDetailRow {
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
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  notes: string;
  affectedEndpoint: string | null;
  summary: string;
}

type IncidentFullRow = {
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
  acknowledged_at: Date | null;
  acknowledged_by: string | null;
  notes: string;
  affected_endpoint: string | null;
  summary: string;
};

type EventRow = {
  id: string;
  incident_id: string;
  kind: IncidentEventKind;
  message: string;
  actor: string | null;
  created_at: Date;
};

type DeploymentRow = {
  id: string;
  project_id: string;
  service: string;
  version: string;
  environment: string;
  deployed_at: Date;
  metadata: Record<string, unknown>;
};

function mapIncident(row: IncidentFullRow): IncidentDetailRow {
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
    acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
    acknowledgedBy: row.acknowledged_by,
    notes: row.notes ?? "",
    affectedEndpoint: row.affected_endpoint,
    summary: row.summary ?? "",
  };
}

function mapEvent(row: EventRow): IncidentEvent {
  return {
    id: row.id,
    incidentId: row.incident_id,
    kind: row.kind,
    message: row.message,
    actor: row.actor,
    createdAt: row.created_at.toISOString(),
  };
}

function mapDeployment(row: DeploymentRow): Deployment {
  return {
    id: row.id,
    projectId: row.project_id,
    service: row.service,
    version: row.version,
    environment: row.environment,
    deployedAt: row.deployed_at.toISOString(),
    metadata: row.metadata ?? {},
  };
}

export const AFFECTED_ENDPOINTS: Record<string, string> = {
  "payment-api": "POST /payments",
  "order-api": "POST /orders",
  "shop-api": "POST /orders",
  "product-api": "GET /products",
  "notification-worker": "POST /notify",
};

export class IncidentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async listIncidents(
    projectId: string,
    opts: { status?: IncidentStatus | "active"; limit?: number } = {},
  ): Promise<IncidentDetailRow[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const params: unknown[] = [projectId];
    let where = `project_id = $1`;
    if (opts.status === "active") {
      where += ` AND status IN ('open', 'acknowledged')`;
    } else if (opts.status) {
      params.push(opts.status);
      where += ` AND status = $${params.length}`;
    }
    params.push(limit);
    const result = await this.pool.query<IncidentFullRow>(
      `SELECT * FROM incidents WHERE ${where}
       ORDER BY
         CASE status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
         started_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map(mapIncident);
  }

  async getIncident(id: string): Promise<IncidentDetailRow | null> {
    const result = await this.pool.query<IncidentFullRow>(
      `SELECT * FROM incidents WHERE id = $1`,
      [id],
    );
    return result.rowCount ? mapIncident(result.rows[0]!) : null;
  }

  async listEvents(incidentId: string): Promise<IncidentEvent[]> {
    const result = await this.pool.query<EventRow>(
      `SELECT * FROM incident_events
       WHERE incident_id = $1
       ORDER BY created_at ASC`,
      [incidentId],
    );
    return result.rows.map(mapEvent);
  }

  async addEvent(input: {
    incidentId: string;
    kind: IncidentEventKind;
    message: string;
    actor?: string | null;
  }): Promise<IncidentEvent> {
    const result = await this.pool.query<EventRow>(
      `INSERT INTO incident_events (incident_id, kind, message, actor)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [input.incidentId, input.kind, input.message, input.actor ?? null],
    );
    return mapEvent(result.rows[0]!);
  }

  async acknowledge(
    id: string,
    actor = "operator",
  ): Promise<IncidentDetailRow | null> {
    const result = await this.pool.query<IncidentFullRow>(
      `UPDATE incidents SET
         status = 'acknowledged',
         acknowledged_at = COALESCE(acknowledged_at, NOW()),
         acknowledged_by = COALESCE(acknowledged_by, $2)
       WHERE id = $1 AND status IN ('open', 'acknowledged')
       RETURNING *`,
      [id, actor],
    );
    if (!result.rowCount) return null;
    await this.addEvent({
      incidentId: id,
      kind: "acknowledged",
      message: `Acknowledged by ${actor}`,
      actor,
    });
    return mapIncident(result.rows[0]!);
  }

  async resolve(
    id: string,
    actor = "operator",
  ): Promise<IncidentDetailRow | null> {
    const result = await this.pool.query<IncidentFullRow>(
      `UPDATE incidents SET
         status = 'resolved',
         resolved_at = NOW()
       WHERE id = $1 AND status IN ('open', 'acknowledged')
       RETURNING *`,
      [id],
    );
    if (!result.rowCount) return null;
    await this.addEvent({
      incidentId: id,
      kind: "resolved",
      message: `Resolved by ${actor}`,
      actor,
    });
    // Clear open_incident_id pointers on alert_states
    await this.pool.query(
      `UPDATE alert_states SET open_incident_id = NULL, status = 'ok',
         pending_since = NULL, firing_since = NULL, updated_at = NOW()
       WHERE open_incident_id = $1`,
      [id],
    );
    return mapIncident(result.rows[0]!);
  }

  async addNote(
    id: string,
    note: string,
    actor = "operator",
  ): Promise<IncidentDetailRow | null> {
    const current = await this.getIncident(id);
    if (!current) return null;
    const merged = current.notes
      ? `${current.notes}\n\n[${new Date().toISOString()}] ${actor}: ${note}`
      : `[${new Date().toISOString()}] ${actor}: ${note}`;
    const result = await this.pool.query<IncidentFullRow>(
      `UPDATE incidents SET notes = $2 WHERE id = $1 RETURNING *`,
      [id, merged],
    );
    await this.addEvent({
      incidentId: id,
      kind: "note",
      message: note,
      actor,
    });
    return mapIncident(result.rows[0]!);
  }

  async ensureOpenedEvent(incidentId: string, title: string): Promise<void> {
    const existing = await this.pool.query(
      `SELECT 1 FROM incident_events WHERE incident_id = $1 AND kind = 'opened' LIMIT 1`,
      [incidentId],
    );
    if ((existing.rowCount ?? 0) > 0) return;
    await this.addEvent({
      incidentId,
      kind: "opened",
      message: `Incident opened: ${title}`,
      actor: "system",
    });
  }

  async patchImpact(
    id: string,
    patch: { affectedEndpoint?: string | null; summary?: string },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE incidents SET
         affected_endpoint = COALESCE($2, affected_endpoint),
         summary = COALESCE($3, summary)
       WHERE id = $1`,
      [id, patch.affectedEndpoint ?? null, patch.summary ?? null],
    );
  }

  async listDeploymentsNear(opts: {
    projectId: string;
    service: string;
    around: Date;
    beforeHours?: number;
    afterHours?: number;
  }): Promise<Deployment[]> {
    const beforeMs = (opts.beforeHours ?? 6) * 3600_000;
    const afterMs = (opts.afterHours ?? 1) * 3600_000;
    const start = new Date(opts.around.getTime() - beforeMs);
    const end = new Date(opts.around.getTime() + afterMs);
    const result = await this.pool.query<DeploymentRow>(
      `SELECT * FROM deployments
       WHERE project_id = $1
         AND service = $2
         AND deployed_at BETWEEN $3 AND $4
       ORDER BY deployed_at DESC`,
      [opts.projectId, opts.service, start, end],
    );
    return result.rows.map(mapDeployment);
  }

  async listRecentDeployments(
    projectId: string,
    limit = 20,
  ): Promise<Deployment[]> {
    const result = await this.pool.query<DeploymentRow>(
      `SELECT * FROM deployments
       WHERE project_id = $1
       ORDER BY deployed_at DESC
       LIMIT $2`,
      [projectId, limit],
    );
    return result.rows.map(mapDeployment);
  }

  async summary(projectId: string): Promise<{
    open: number;
    acknowledged: number;
    resolved: number;
    critical: number;
  }> {
    const result = await this.pool.query<{
      open: string;
      acknowledged: string;
      resolved: string;
      critical: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'open')::text AS open,
         COUNT(*) FILTER (WHERE status = 'acknowledged')::text AS acknowledged,
         COUNT(*) FILTER (WHERE status = 'resolved')::text AS resolved,
         COUNT(*) FILTER (
           WHERE status IN ('open','acknowledged') AND severity = 'critical'
         )::text AS critical
       FROM incidents WHERE project_id = $1`,
      [projectId],
    );
    return {
      open: Number(result.rows[0]?.open ?? 0),
      acknowledged: Number(result.rows[0]?.acknowledged ?? 0),
      resolved: Number(result.rows[0]?.resolved ?? 0),
      critical: Number(result.rows[0]?.critical ?? 0),
    };
  }
}
