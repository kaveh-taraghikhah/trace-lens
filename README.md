# TraceLens

Local observability app I built to learn the OpenTelemetry stack end-to-end: instrumented demo services → Collector → Prometheus / Tempo / Loki, plus a small control plane (alerts, incidents, API keys) on Postgres.

This is a **portfolio / lab project**, not a hosted SaaS. The UI reads real backends; platform data (alerts, incidents, keys) is scoped to a seeded demo project. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for what is stubbed vs wired.

## What it does

| Layer | Role |
|-------|------|
| **Demo mesh** | `shop-api` → `product-api`, `order-api`, `payment-api`, `notification-worker` |
| **Signal path** | OTLP → OpenTelemetry Collector → Tempo, Loki, Prometheus |
| **TraceLens API** | Fastify: query backends, evaluate alert rules, enrich incidents |
| **TraceLens web** | Next.js: services RED, traces, logs, service map, incident view |

The flow I care about in interviews: **simulate a payment failure → alert fires after `FOR` → open incident → traces + logs around start time**. That path is real; see [5-minute demo](#5-minute-demo) below.

## Why I built it

I wanted something hands-on beyond reading docs: PromQL that survives OTel semconv label drift, alert evaluation that does not auto-resolve when Prometheus misses a scrape, and correlating traces/logs on an incident page. Most of the “product” code lives in `apps/api/src/adapters/` and `apps/api/src/alerts/evaluator.ts`.

Pain I actually hit locally: host `HTTP(S)_PROXY` leaking into containers and breaking OTLP — `compose.yml` clears proxy env on every service for that reason. Stack is **Podman-native** ([docs/PODMAN.md](docs/PODMAN.md)).

## Quick start

**Prerequisites:** Node 20+, pnpm 9+, **Podman** (rootless) + a compose provider. See [docs/PODMAN.md](docs/PODMAN.md).

```bash
pnpm install && pnpm build
pnpm run stack:up          # podman compose up -d (scripts/podman-stack.sh)
# first time / after demo code changes: pnpm run stack:build

# Terminal 1 — API (dev auth = anonymous admin on the demo project)
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
  -u ALL_PROXY -u all_proxy NO_PROXY='*' \
  PROMETHEUS_URL=http://localhost:9090 TEMPO_URL=http://localhost:3200 LOKI_URL=http://localhost:3100 \
  DATABASE_URL=postgres://tracelens:tracelens@localhost:5432/tracelens \
  TRACELENS_AUTH_MODE=dev \
  pnpm --filter @tracelens/api start

# Terminal 2 — Web UI (port 3101 in compose, or dev server)
TRACELENS_API_URL=http://localhost:4000 pnpm --filter @tracelens/web start
```

| UI | URL |
|----|-----|
| Services | http://localhost:3101/services |
| Incidents | http://localhost:3101/incidents |
| Settings | http://localhost:3101/settings |

Run checks: `pnpm typecheck` and `pnpm test` (platform auth helpers).

## 5-minute demo

1. Bring the stack up (above). Wait until Prometheus has scraped the demo services (~30s).
2. Open **Services** — you should see RED metrics for `shop-api`, `payment-api`, etc. If empty, hit the shop: `curl http://localhost:3001/health` and refresh.
3. Open **Incidents** → use **Simulate incident** (or call payment-api’s simulate endpoint — see `demo-services/payment-api`).
4. Open the new incident: related traces, log lines, and deployment stub around `startedAt`.
5. Optional: enable `TRACELENS_AUTH_MODE=api_key`, paste the demo admin key on **Settings**, and try creating a key as the viewer role (403).

**Cardinality trap (intentional):** `GET /products?stress_cardinality=1` on product-api adds a high-cardinality span attribute per request — useful when showing why label allowlists matter. Documented in [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Security & ops (local experiments)

These work for the **API + Postgres platform layer**. They are not full production hardening.

| Area | What works today |
|------|------------------|
| API keys | `sha256(pepper ‖ key)`, prefix display, revoke |
| Auth | `TRACELENS_AUTH_MODE=dev` (open admin) or `api_key` |
| RBAC | `viewer` < `operator` < `admin` on routes |
| Rate limit | `@fastify/rate-limit` (default 120/min per key or IP) |
| Audit | Mutations logged to `audit_logs` |
| Sampling / retention in UI | **Stored only** — apply Collector config yourself (`observability/otel-collector/tail-sampling.example.yaml`) |
| Cardinality UI | Allow/deny list checker, not live series counts |
| Metrics/traces/logs queries | Shared backends; not isolated per tenant |

Demo keys (seeded in migrations):

```
Admin:  tl_live_demo_ecommerce_admin_key_0001
Viewer: tl_live_demo_ecommerce_viewer_key_0001
```

```bash
TRACELENS_AUTH_MODE=api_key … pnpm --filter @tracelens/api start

curl -H 'X-API-Key: tl_live_demo_ecommerce_viewer_key_0001' \
  http://localhost:4000/api/services

# Viewer cannot create keys (403)
curl -i -X POST -H 'X-API-Key: tl_live_demo_ecommerce_viewer_key_0001' \
  -H 'content-type: application/json' \
  -d '{"name":"x","role":"viewer"}' \
  http://localhost:4000/api/platform/keys
```

Set `TRACELENS_KEY_PEPPER` before any real deployment; default pepper is for local dev only.

For SSR with `api_key` mode, set `TRACELENS_API_KEY` when starting the Next.js server.

## Repo layout

```
apps/api              Fastify control plane + backend adapters (+ Containerfile)
apps/web              Next.js UI (+ Containerfile)
packages/database     Alerts, incidents, platform (Postgres)
packages/telemetry    Shared OTel + Pino bridge
packages/config       Shared Node TypeScript config (tsconfig.node.json)
demo-services/        Instrumented Fastify demos (+ Containerfile)
observability/        Collector, Tempo, Loki, Prometheus, Grafana configs
compose.yml           Podman Compose stack (SELinux :Z, no-new-privileges)
scripts/podman-stack.sh  pnpm stack:* entrypoint
docs/                 LIMITATIONS, PODMAN, development notes
```

## Development history

Feature order and rough timeline: [docs/CHANGELOG.md](docs/CHANGELOG.md).

## License

Private portfolio project — contact me before reuse.
