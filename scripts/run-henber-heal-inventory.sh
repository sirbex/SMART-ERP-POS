#!/usr/bin/env bash
# SSH to production and heal Henber inventory GL drift inside the backend container.
set -euo pipefail
HOST="${DEPLOY_HOST:-209.38.203.138}"
USER="${DEPLOY_USER:-root}"
REPO="${DEPLOY_REPO:-/opt/smarterp}"

echo "==> Copy heal script to backend container on $HOST"
ssh "$USER@$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/smarterp
docker exec smarterp-backend mkdir -p /app/scripts
docker cp scripts/henber-heal-inventory-gl.mjs smarterp-backend:/app/scripts/henber-heal-inventory-gl.mjs
docker exec -w /app smarterp-backend node scripts/henber-heal-inventory-gl.mjs
REMOTE
