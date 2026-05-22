#!/bin/bash
# Migration status for ALL tenant databases on this postgres instance.
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-}"
for name in smarterp-postgres samplepos-postgres; do
  if docker ps --format '{{.Names}}' | grep -qx "$name"; then
    CONTAINER="$name"
    break
  fi
done
if [ -z "$CONTAINER" ]; then
  echo "No postgres container found (tried smarterp-postgres, samplepos-postgres)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/discover-tenant-databases.sh
source "$SCRIPT_DIR/scripts/lib/discover-tenant-databases.sh"

discover_tenant_databases "$CONTAINER"

for db in "${TENANT_DBS[@]}"; do
  echo "=== $db ==="
  docker exec "$CONTAINER" psql -U postgres -d "$db" -tc \
    "SELECT filename, executed_at FROM schema_migrations ORDER BY executed_at DESC LIMIT 5;" 2>/dev/null \
    || echo "  (cannot query schema_migrations)"
done
