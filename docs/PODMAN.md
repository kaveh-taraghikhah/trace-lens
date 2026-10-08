# Podman (native stack)

TraceLens is **Podman-only** for containers. Scripts call `podman compose` (with a `podman-compose` fallback). Docker Engine / `docker compose` are not part of the supported workflow.

## Prerequisites

| Tool | Why |
|------|-----|
| [Podman](https://podman.io) ≥ 4.x (5.x preferred) | Runtime + `podman compose` |
| Compose provider | `podman compose` delegates to an external provider (`docker-compose` **or** `podman-compose`) |
| Node 20+, pnpm 9+ | Host builds / API & web outside the stack |
| SELinux (Fedora/RHEL) | Bind mounts use `:Z` — required for rootless volume labels |

Check:

```bash
podman version
podman info --format 'Rootless={{.Host.Security.Rootless}} Cgroup={{.Host.CgroupManager}}'
podman compose version   # prints the external provider version
```

On this project’s reference host, `podman compose` often uses `/usr/local/bin/docker-compose` as the **provider** while still talking to the **Podman** engine. That is normal. To force the Python provider:

```bash
export COMPOSE_PROVIDER=podman-compose
# or permanently in ~/.config/containers/containers.conf:
# [engine]
# compose_providers = ["/usr/bin/podman-compose"]
```

## What “Podman-native” means here

| Piece | Choice | Detail |
|-------|--------|--------|
| Build files | `Containerfile` | OCI build instructions; same syntax as Dockerfile |
| Ignore file | `.containerignore` | Podman reads this (and still accepts `.dockerignore` if present) |
| Orchestration | `compose.yml` + `scripts/podman-stack.sh` | `pnpm run stack:*` |
| Image pulls | `docker.io/...` FQDNs | Registry hostname — **not** the Docker daemon |
| SELinux mounts | `:Z` on bind mounts | Relabels content for the container |
| Hardening | `security_opt: [no-new-privileges:true]` | Applied via `x-podman-app` anchor |
| Rootless | Expected default | `podman info` → `Rootless=true` |

**Intentionally unchanged (looks “Docker”, isn’t engine-specific):**

- Path `/docker-entrypoint-initdb.d/` inside the official Postgres image
- Compose key name `dockerfile:` (Compose spec) pointing at `Containerfile`
- Registry `docker.io`

## Day-to-day commands

```bash
pnpm install && pnpm build
pnpm run deploy:demos          # or included in stack:build
pnpm run stack:up              # podman compose up -d
pnpm run stack:build           # deploy demos + rebuild images + up
pnpm run stack:down
pnpm run stack:ps
pnpm run stack:logs            # all services
./scripts/podman-stack.sh logs otel-collector
```

Manual builds (same files Compose uses):

```bash
podman build -f demo-services/Containerfile \
  --build-arg SERVICE_NAME=shop-api -t localhost/shop-api .

podman build -f apps/api/Containerfile -t localhost/tracelens-api .
podman build -f apps/web/Containerfile -t localhost/tracelens-web .
```

## Rootless notes (Fedora / RHEL)

1. **Proxy leak** — Host `HTTP(S)_PROXY` breaks OTLP and in-network DNS. `compose.yml` clears proxy env on every service (`x-no-proxy`). When running the API on the host, strip proxies as in the README.
2. **Ports** — Rootless Podman publishes via pasta/slirp. `localhost:5432`, `:9090`, etc. still work for host → container.
3. **`:Z` vs `:z`** — `:Z` private relabel (this repo). Don’t drop it on SELinux hosts or config bind-mounts fail with permission errors.
4. **Volumes** — Named volumes (`tempo-data`, …) live under the user container storage graph; no extra SELinux flags needed.
5. **Linger (optional)** — For user services that must survive logout: `loginctl enable-linger "$USER"`.

## Compose vs Quadlet

This lab stays on **Compose** for a multi-service demo mesh (fast iterate, one file).

**Quadlet** (systemd + Podman) is the more “native” long-running model on Fedora:

| Compose | Quadlet |
|---------|---------|
| `podman compose up -d` | `systemctl --user start tracelens-*.service` |
| One `compose.yml` | One `.container` / `.volume` / `.network` unit per resource |
| Great for labs | Great for always-on user services |

Example skeleton (not wired as the default) — put under `~/.config/containers/systemd/`:

```ini
# tracelens.network
[Network]
NetworkName=tracelens
```

```ini
# tracelens-postgres.container
[Unit]
Description=TraceLens demo Postgres
After=network-online.target

[Container]
Image=docker.io/library/postgres:16-alpine
Network=tracelens.network
PublishPort=5432:5432
Environment=POSTGRES_USER=tracelens
Environment=POSTGRES_PASSWORD=tracelens
Environment=POSTGRES_DB=tracelens_demo
Volume=tracelens-pg.volume:/var/lib/postgresql/data
SecurityLabelDisable=false
NoNewPrivileges=true

[Service]
Restart=always

[Install]
WantedBy=default.target
```

Then: `systemctl --user daemon-reload && systemctl --user start tracelens-postgres.service`.

Keeping Compose as default avoids duplicating ~15 services; Quadlet is documented here for when you promote a subset to always-on.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `permission denied` on bind-mounted YAML | Ensure `:Z` on the mount; `podman unshare ls` to inspect |
| OTLP / DNS failures inside containers | Confirm proxy env is empty in the container: `podman exec <ctr> env \| rg -i proxy` |
| `podman compose` missing | Install a provider (`docker-compose` or `podman-compose`); scripts fall back to `podman-compose` |
| Images rebuild every time | Run `pnpm run deploy:demos` before `stack:build` so `.deploy/*` exists for `Containerfile` `COPY` |
| Want Docker instead | Not supported by `stack:*` — fork scripts and rename files if you need it |

## File map

```
compose.yml                 Podman Compose project
.containerignore            Build context exclusions
apps/api/Containerfile
apps/web/Containerfile
demo-services/Containerfile
scripts/podman-stack.sh     pnpm stack:* implementation
docs/PODMAN.md              This file
```
