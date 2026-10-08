-- Incident lifecycle, events, deployment correlation for investigation UI

-- Expand incident lifecycle: open → acknowledged → resolved
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_status_check
  CHECK (status IN ('open', 'acknowledged', 'resolved'));

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS affected_endpoint TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  version TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'demo',
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS deployments_service_time_idx
  ON deployments (project_id, service, deployed_at DESC);

CREATE TABLE IF NOT EXISTS incident_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'opened',
    'acknowledged',
    'resolved',
    'note',
    'severity_changed',
    'enriched'
  )),
  message TEXT NOT NULL,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS incident_events_incident_idx
  ON incident_events (incident_id, created_at ASC);

-- Seed a "risky" payment deploy shortly before typical demo fires (idempotent).
INSERT INTO deployments (id, project_id, service, version, environment, deployed_at, metadata)
VALUES (
  '44444444-4444-4444-4444-444444444401',
  '22222222-2222-2222-2222-222222222222',
  'payment-api',
  'v1.8.0',
  'demo',
  NOW() - INTERVAL '25 minutes',
  '{"change":"increased Stripe client timeout retries","author":"demo"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO deployments (id, project_id, service, version, environment, deployed_at, metadata)
VALUES (
  '44444444-4444-4444-4444-444444444402',
  '22222222-2222-2222-2222-222222222222',
  'order-api',
  'v2.3.1',
  'demo',
  NOW() - INTERVAL '3 hours',
  '{"change":"cart validation tweak","author":"demo"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Backfill timeline events for any open incidents that lack an opened event
INSERT INTO incident_events (incident_id, kind, message, actor, created_at)
SELECT i.id, 'opened', 'Incident opened by alert evaluator', 'system', i.started_at
FROM incidents i
WHERE NOT EXISTS (
  SELECT 1 FROM incident_events e WHERE e.incident_id = i.id AND e.kind = 'opened'
);
