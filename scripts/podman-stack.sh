#!/usr/bin/env bash
# TraceLens stack helper — Podman-only entrypoint for compose.yml.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v podman >/dev/null 2>&1; then
  echo "error: podman is required (https://podman.io). Docker is not supported by this project's scripts." >&2
  exit 1
fi

# Prefer the Podman CLI compose subcommand (delegates to an external provider).
# Override with COMPOSE_PROVIDER if needed, e.g.:
#   export COMPOSE_PROVIDER=podman-compose
compose() {
  if podman compose version >/dev/null 2>&1; then
    podman compose "$@"
  elif command -v podman-compose >/dev/null 2>&1; then
    echo "note: falling back to podman-compose (install podman's compose provider for 'podman compose')" >&2
    podman-compose "$@"
  else
    echo "error: neither 'podman compose' nor 'podman-compose' is available." >&2
    echo "  Fedora: sudo dnf install podman-compose   # or docker-compose as provider" >&2
    exit 1
  fi
}

usage() {
  cat <<'EOF'
Usage: scripts/podman-stack.sh <command> [args...]

Commands:
  up         Start the stack detached (podman compose up -d)
  down       Stop and remove containers (podman compose down)
  build      Deploy demo bundles, then rebuild & start (--build -d)
  ps         Show compose services
  logs       Tail logs (pass service name optionally)
  pull       Pull published images
  build-only Build local images without starting

Examples:
  pnpm run stack:up
  ./scripts/podman-stack.sh logs otel-collector
  COMPOSE_PROVIDER=podman-compose ./scripts/podman-stack.sh up
EOF
}

cmd="${1:-}"
shift || true

case "$cmd" in
  up)         compose up -d "$@" ;;
  down)       compose down "$@" ;;
  build)
    node "$ROOT/scripts/deploy-demos.mjs"
    compose up --build -d "$@"
    ;;
  ps)         compose ps "$@" ;;
  logs)       compose logs -f "$@" ;;
  pull)       compose pull "$@" ;;
  build-only) compose build "$@" ;;
  -h|--help|help|"") usage; [[ -n "$cmd" ]] || exit 1 ;;
  *)
    echo "error: unknown command '$cmd'" >&2
    usage
    exit 1
    ;;
esac
