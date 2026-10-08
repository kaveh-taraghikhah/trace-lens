-- API keys (hashed), audit log, project settings (sampling/retention targets)

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'operator', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_keys_project_idx ON api_keys (project_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_project_time_idx
  ON audit_logs (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_settings (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  -- Sampling targets (percent 0-100). Documented intent for Collector tail sampling.
  sample_errors_pct INT NOT NULL DEFAULT 100 CHECK (sample_errors_pct BETWEEN 0 AND 100),
  sample_slow_pct INT NOT NULL DEFAULT 100 CHECK (sample_slow_pct BETWEEN 0 AND 100),
  sample_normal_pct INT NOT NULL DEFAULT 10 CHECK (sample_normal_pct BETWEEN 0 AND 100),
  slow_threshold_ms INT NOT NULL DEFAULT 1000 CHECK (slow_threshold_ms >= 100),
  -- Retention targets (hours) — mirrored into Tempo/Loki ops docs / compose.
  retention_traces_hours INT NOT NULL DEFAULT 24 CHECK (retention_traces_hours BETWEEN 1 AND 720),
  retention_logs_hours INT NOT NULL DEFAULT 168 CHECK (retention_logs_hours BETWEEN 1 AND 2160),
  -- Cardinality allowlist for metric labels
  allowed_metric_labels TEXT[] NOT NULL DEFAULT ARRAY[
    'service','service_name','route','http_route','method','http_method',
    'status_code','http_status_code','region'
  ],
  forbidden_metric_labels TEXT[] NOT NULL DEFAULT ARRAY[
    'user_id','user.id','request_id','request.id','order_id','order.id','email'
  ],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO project_settings (project_id)
VALUES ('22222222-2222-2222-2222-222222222222')
ON CONFLICT (project_id) DO NOTHING;

-- Demo admin key (plaintext documented in README):
--   tl_live_demo_ecommerce_admin_key_0001
-- Hash = sha256(pepper || plaintext) with default pepper tracelens-dev-pepper
INSERT INTO api_keys (id, project_id, name, key_prefix, key_hash, role)
VALUES (
  '55555555-5555-5555-5555-555555555501',
  '22222222-2222-2222-2222-222222222222',
  'Demo Admin',
  'tl_live_demo',
  encode(
    digest(
      'tracelens-dev-pepper' || 'tl_live_demo_ecommerce_admin_key_0001',
      'sha256'
    ),
    'hex'
  ),
  'admin'
)
ON CONFLICT (key_hash) DO NOTHING;

-- Demo viewer key:
--   tl_live_demo_ecommerce_viewer_key_0001
INSERT INTO api_keys (id, project_id, name, key_prefix, key_hash, role)
VALUES (
  '55555555-5555-5555-5555-555555555502',
  '22222222-2222-2222-2222-222222222222',
  'Demo Viewer',
  'tl_live_demo',
  encode(
    digest(
      'tracelens-dev-pepper' || 'tl_live_demo_ecommerce_viewer_key_0001',
      'sha256'
    ),
    'hex'
  ),
  'viewer'
)
ON CONFLICT (key_hash) DO NOTHING;
