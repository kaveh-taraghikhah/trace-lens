import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";

export type ApiKeyRole = "viewer" | "operator" | "admin";

export interface ApiKeyRecord {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  role: ApiKeyRole;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  projectId: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export interface ProjectSettings {
  projectId: string;
  sampleErrorsPct: number;
  sampleSlowPct: number;
  sampleNormalPct: number;
  slowThresholdMs: number;
  retentionTracesHours: number;
  retentionLogsHours: number;
  allowedMetricLabels: string[];
  forbiddenMetricLabels: string[];
  updatedAt: string;
}

type KeyRow = {
  id: string;
  project_id: string;
  name: string;
  key_prefix: string;
  role: ApiKeyRole;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
};

type AuditRow = {
  id: string;
  project_id: string;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  created_at: Date;
};

type SettingsRow = {
  project_id: string;
  sample_errors_pct: number;
  sample_slow_pct: number;
  sample_normal_pct: number;
  slow_threshold_ms: number;
  retention_traces_hours: number;
  retention_logs_hours: number;
  allowed_metric_labels: string[];
  forbidden_metric_labels: string[];
  updated_at: Date;
};

function mapKey(row: KeyRow): ApiKeyRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    role: row.role,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
  };
}

function mapAudit(row: AuditRow): AuditLogEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    actor: row.actor,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: row.metadata ?? {},
    ip: row.ip,
    createdAt: row.created_at.toISOString(),
  };
}

function mapSettings(row: SettingsRow): ProjectSettings {
  return {
    projectId: row.project_id,
    sampleErrorsPct: row.sample_errors_pct,
    sampleSlowPct: row.sample_slow_pct,
    sampleNormalPct: row.sample_normal_pct,
    slowThresholdMs: row.slow_threshold_ms,
    retentionTracesHours: row.retention_traces_hours,
    retentionLogsHours: row.retention_logs_hours,
    allowedMetricLabels: row.allowed_metric_labels ?? [],
    forbiddenMetricLabels: row.forbidden_metric_labels ?? [],
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Override in any non-local deploy; default is intentionally obvious. */
export function getKeyPepper(): string {
  return process.env.TRACELENS_KEY_PEPPER ?? "tracelens-dev-pepper";
}

export function hashApiKey(plaintext: string, pepper = getKeyPepper()): string {
  return createHash("sha256").update(pepper + plaintext, "utf8").digest("hex");
}

export function generateApiKeyPlaintext(): {
  plaintext: string;
  prefix: string;
} {
  const token = randomBytes(24).toString("hex");
  const plaintext = `tl_live_${token}`;
  return { plaintext, prefix: plaintext.slice(0, 12) };
}

const ROLE_RANK: Record<ApiKeyRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

export function roleAtLeast(role: ApiKeyRole, required: ApiKeyRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export class PlatformRepository {
  constructor(private readonly pool: pg.Pool) {}

  async findApiKeyByPlaintext(
    plaintext: string,
  ): Promise<ApiKeyRecord | null> {
    const hash = hashApiKey(plaintext);
    const result = await this.pool.query<KeyRow>(
      `SELECT id, project_id, name, key_prefix, role, created_at, last_used_at, revoked_at
       FROM api_keys
       WHERE key_hash = $1 AND revoked_at IS NULL`,
      [hash],
    );
    if (!result.rowCount) return null;
    return mapKey(result.rows[0]!);
  }

  async touchApiKey(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  async listApiKeys(projectId: string): Promise<ApiKeyRecord[]> {
    const result = await this.pool.query<KeyRow>(
      `SELECT id, project_id, name, key_prefix, role, created_at, last_used_at, revoked_at
       FROM api_keys
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId],
    );
    return result.rows.map(mapKey);
  }

  async createApiKey(input: {
    projectId: string;
    name: string;
    role: ApiKeyRole;
  }): Promise<{ record: ApiKeyRecord; plaintext: string }> {
    const { plaintext, prefix } = generateApiKeyPlaintext();
    const hash = hashApiKey(plaintext);
    const result = await this.pool.query<KeyRow>(
      `INSERT INTO api_keys (project_id, name, key_prefix, key_hash, role)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, project_id, name, key_prefix, role, created_at, last_used_at, revoked_at`,
      [input.projectId, input.name, prefix, hash, input.role],
    );
    return { record: mapKey(result.rows[0]!), plaintext };
  }

  async revokeApiKey(id: string, projectId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE api_keys SET revoked_at = NOW()
       WHERE id = $1 AND project_id = $2 AND revoked_at IS NULL`,
      [id, projectId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async writeAudit(input: {
    projectId: string;
    actor: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
    ip?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs (
         project_id, actor, action, resource_type, resource_id, metadata, ip
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.projectId,
        input.actor,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.ip ?? null,
      ],
    );
  }

  async listAudit(
    projectId: string,
    limit = 50,
  ): Promise<AuditLogEntry[]> {
    const result = await this.pool.query<AuditRow>(
      `SELECT id, project_id, actor, action, resource_type, resource_id,
              metadata, host(ip)::text AS ip, created_at
       FROM audit_logs
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, Math.min(Math.max(limit, 1), 200)],
    );
    return result.rows.map(mapAudit);
  }

  async getSettings(projectId: string): Promise<ProjectSettings | null> {
    const result = await this.pool.query<SettingsRow>(
      `SELECT * FROM project_settings WHERE project_id = $1`,
      [projectId],
    );
    return result.rowCount ? mapSettings(result.rows[0]!) : null;
  }

  async updateSettings(
    projectId: string,
    patch: Partial<
      Omit<ProjectSettings, "projectId" | "updatedAt">
    >,
  ): Promise<ProjectSettings | null> {
    const current = await this.getSettings(projectId);
    if (!current) return null;
    const next = {
      sampleErrorsPct: patch.sampleErrorsPct ?? current.sampleErrorsPct,
      sampleSlowPct: patch.sampleSlowPct ?? current.sampleSlowPct,
      sampleNormalPct: patch.sampleNormalPct ?? current.sampleNormalPct,
      slowThresholdMs: patch.slowThresholdMs ?? current.slowThresholdMs,
      retentionTracesHours:
        patch.retentionTracesHours ?? current.retentionTracesHours,
      retentionLogsHours:
        patch.retentionLogsHours ?? current.retentionLogsHours,
      allowedMetricLabels:
        patch.allowedMetricLabels ?? current.allowedMetricLabels,
      forbiddenMetricLabels:
        patch.forbiddenMetricLabels ?? current.forbiddenMetricLabels,
    };
    const result = await this.pool.query<SettingsRow>(
      `UPDATE project_settings SET
         sample_errors_pct = $2,
         sample_slow_pct = $3,
         sample_normal_pct = $4,
         slow_threshold_ms = $5,
         retention_traces_hours = $6,
         retention_logs_hours = $7,
         allowed_metric_labels = $8,
         forbidden_metric_labels = $9,
         updated_at = NOW()
       WHERE project_id = $1
       RETURNING *`,
      [
        projectId,
        next.sampleErrorsPct,
        next.sampleSlowPct,
        next.sampleNormalPct,
        next.slowThresholdMs,
        next.retentionTracesHours,
        next.retentionLogsHours,
        next.allowedMetricLabels,
        next.forbiddenMetricLabels,
      ],
    );
    return mapSettings(result.rows[0]!);
  }
}
