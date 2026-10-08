-- Seed default org/project + starter alert rules
INSERT INTO organizations (id, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'TraceLens Demo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, organization_id, name, slug)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'E-Commerce Demo',
  'ecommerce-demo'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO alert_rules (
  id, project_id, name, description, metric_type, service,
  comparator, threshold, window_seconds, for_seconds, severity, enabled
)
VALUES
(
  '33333333-3333-3333-3333-333333333301',
  '22222222-2222-2222-2222-222222222222',
  'Payment API Error Rate High',
  'Fires when payment-api 5xx rate exceeds 5% for 15 seconds.',
  'error_rate',
  'payment-api',
  'gt',
  0.05,
  300,
  15,
  'critical',
  TRUE
),
(
  '33333333-3333-3333-3333-333333333302',
  '22222222-2222-2222-2222-222222222222',
  'Payment API p95 Latency High',
  'Fires when payment-api p95 latency exceeds 1000ms for 30 seconds.',
  'p95_latency',
  'payment-api',
  'gt',
  1000,
  300,
  30,
  'warning',
  TRUE
),
(
  '33333333-3333-3333-3333-333333333303',
  '22222222-2222-2222-2222-222222222222',
  'Order API Error Rate High',
  'Fires when order-api error rate exceeds 3% for 2 minutes.',
  'error_rate',
  'order-api',
  'gt',
  0.03,
  300,
  120,
  'warning',
  TRUE
)
ON CONFLICT (id) DO NOTHING;
