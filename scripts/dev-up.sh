#!/usr/bin/env bash
# One-shot: seed media → start Stash+bridge → bootstrap catalog → smoke test.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p stash-data/{config,media,metadata,cache,blobs,generated}

echo "==> seed media"
bash scripts/seed-media.sh

echo "==> docker compose up"
docker compose up -d --build

echo "==> wait + bootstrap stash"
# bootstrap talks to published host port
STASH_URL="${STASH_URL:-http://127.0.0.1:9999}" node scripts/bootstrap-stash.mjs

# Refresh bridge with API key from .env.local
if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  set -a
  # Values may be quoted; source is intentional for docker env refresh.
  source .env.local
  set +a
  echo "==> recreate bridge with env from .env.local"
  STASH_API_KEY="${STASH_API_KEY:-}" \
  STASH_PUBLIC_URL="${STASH_PUBLIC_URL:-http://127.0.0.1:9999}" \
  SOURCE_NAME="${SOURCE_NAME:-Stash Dev}" \
    docker compose up -d bridge
fi

echo "==> smoke bridge"
sleep 2
curl -sf -X POST "http://127.0.0.1:3099/api/status" \
  -H "content-type: application/json" \
  -d '{}' | head -c 400
echo
echo
curl -sf -X POST "http://127.0.0.1:3099/api/videos" \
  -H "content-type: application/json" \
  -d '{"page":1,"pageSize":5,"sort":"date"}' | head -c 800
echo
echo
echo "OK"
echo "Stash UI:  http://127.0.0.1:9999"
echo "Bridge:    http://127.0.0.1:3099"
echo "Deep link: hottub://source?url=http://127.0.0.1:3099"
echo "Plugin:    Settings → Plugins → Hot Tub Bridge (reload if missing)"
