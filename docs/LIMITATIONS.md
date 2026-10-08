# Known limitations

Honest scope for reviewers and recruiters. TraceLens is a learning project with real integrations and some UI-only “intent” fields.

## Not multi-tenant in the observability sense

- One seeded org/project in Postgres. API keys and alert/incident rows are **project-scoped**.
- Prometheus, Tempo, and Loki are **shared** for all requests. There is no per-tenant query filter on metrics/traces/logs.
- “Multi-tenant” in conversation means **platform metadata isolation**, not data-plane isolation.

## Settings that do not drive the running stack

- **Sampling %** and **retention hours** in Settings are persisted in `project_settings` only.
- The running Collector uses `observability/otel-collector/config.yaml`. Tail sampling policies live in `observability/otel-collector/tail-sampling.example.yaml` — you merge/apply that yourself.
- Tempo/Loki retention in compose configs (e.g. 24h traces) is fixed in YAML, not updated when you PATCH settings.

## Cardinality

- Settings **Cardinality guardrails** checks label names against allow/forbid lists. It does not query Prometheus for active series counts.
- **product-api** optionally demonstrates bad practice: `GET /products?stress_cardinality=1` sets a unique span attribute per request (`demo.cardinality_trap`). Use it when explaining cardinality blow-ups; leave it off for normal demos.

## Auth & secrets

- Default `TRACELENS_KEY_PEPPER` is a dev placeholder (`tracelens-dev-pepper` in code).
- `TRACELENS_AUTH_MODE=dev` grants anonymous **admin** on the demo project — fine for localhost only.
- Demo API keys are committed in seed SQL and README for convenience.

## Gaps I would tackle next

- Broader integration tests (CI against ephemeral Postgres / migrations smoke).
- Wire settings export → generated Collector snippet, or drop the UI fields until they are real.
- Per-request tenant filter if backends ever hold more than demo data.

## What is genuinely wired

- OTLP from demos through Collector to Tempo/Loki/Prometheus.
- Alert scheduler with `FOR` duration and hold-on-missing-series behavior (unit-tested in `@tracelens/api`).
- Incident enrichment (traces, logs, deployment correlation fields).
- API key hash lookup, RBAC guards, audit log on mutations, rate limiting.
- PromQL candidate selection + comparator helpers (unit-tested).
