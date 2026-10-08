# Development notes

Rough build order — not a release checklist. Kept here so the README stays about *using* the project.

1. **Pipeline** — Demo services, shared `@tracelens/telemetry`, Collector → Tempo/Loki/Prometheus, Podman Compose stack with proxy env workaround; later switched to Podman-native `Containerfile` / `.containerignore` / `scripts/podman-stack.sh` (see `docs/PODMAN.md`).
2. **Services dashboard** — Prometheus RED overview with multiple PromQL fallbacks for OTel histogram label names.
3. **Traces & logs** — Tempo search/detail, Loki query UI, trace waterfall.
4. **Service map** — Client span edges from Prometheus.
5. **Alerts** — Rules in Postgres, evaluator + scheduler, PromQL templates.
6. **Incidents** — Fire-from-alert, lifecycle, enrichment page (traces/logs/deployments).
7. **Platform** — API keys, RBAC, audit, project settings (sampling/retention as stored targets), rate limits.

Future (not done): integration tests against ephemeral Postgres, settings → Collector automation, real multi-project demos.
