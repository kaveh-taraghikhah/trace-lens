-- TraceLens platform metadata (alerts / incidents)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'error_rate',
    'p95_latency',
    'request_rate',
    'request_rate_drop'
  )),
  service TEXT,
  comparator TEXT NOT NULL CHECK (comparator IN ('gt', 'lt')),
  threshold DOUBLE PRECISION NOT NULL,
  window_seconds INT NOT NULL DEFAULT 300 CHECK (window_seconds >= 60 AND window_seconds <= 3600),
  for_seconds INT NOT NULL DEFAULT 60 CHECK (for_seconds >= 0 AND for_seconds <= 3600),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alert_rules_project_enabled_idx
  ON alert_rules (project_id, enabled);

CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  alert_rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  title TEXT NOT NULL,
  service TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (project_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS incidents_open_idx
  ON incidents (project_id, status, started_at DESC);

CREATE TABLE IF NOT EXISTS alert_states (
  alert_rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'pending', 'firing')),
  pending_since TIMESTAMPTZ,
  firing_since TIMESTAMPTZ,
  last_value DOUBLE PRECISION,
  last_evaluated_at TIMESTAMPTZ,
  last_error TEXT,
  open_incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (alert_rule_id, service)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
