#!/bin/bash
# Discover all SMART-ERP databases that must receive migrations on deploy.
# Source from deploy-update.sh:  source "$(dirname "$0")/lib/discover-tenant-databases.sh"
#
# Union of:
#   1) PostgreSQL: pos_system, pos_template, pos_tenant_*
#   2) Master registry: tenants.database_name (non-deleted)
#
# Sets global array TENANT_DBS (sorted unique).

discover_tenant_databases() {
  local container="${1:?postgres container name required}"
  local -a discovered=()
  local -a registry=()
  local line

  if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
    echo ">>> FATAL: postgres container '$container' not running" >&2
    return 1
  fi

  while IFS= read -r line; do
    line=$(echo "$line" | tr -d '\r' | xargs)
    [ -n "$line" ] && discovered+=("$line")
  done < <(
    docker exec "$container" psql -U postgres -d postgres -t -A -c \
      "SELECT datname FROM pg_database
       WHERE datistemplate = false
         AND (datname IN ('pos_system', 'pos_template') OR datname LIKE 'pos_tenant_%')
       ORDER BY datname;" 2>/dev/null
  )

  if printf '%s\n' "${discovered[@]}" | grep -qx "pos_system"; then
    while IFS= read -r line; do
      line=$(echo "$line" | tr -d '\r' | xargs)
      [ -n "$line" ] && registry+=("$line")
    done < <(
      docker exec "$container" psql -U postgres -d pos_system -t -A -c \
        "SELECT database_name FROM tenants
         WHERE status IS DISTINCT FROM 'DELETED'
           AND database_name IS NOT NULL
         ORDER BY database_name;" 2>/dev/null || true
    )
  fi

  # Merge registry DBs (tenant may exist in master before physical DB)
  local -A seen=()
  TENANT_DBS=()
  for db in "${discovered[@]}" "${registry[@]}"; do
    [ -z "$db" ] && continue
    if [ -z "${seen[$db]+x}" ]; then
      seen["$db"]=1
      TENANT_DBS+=("$db")
    fi
  done
  IFS=$'\n' TENANT_DBS=($(printf '%s\n' "${TENANT_DBS[@]}" | sort -u))
  unset IFS

  if [ "${#TENANT_DBS[@]}" -eq 0 ]; then
    echo ">>> FATAL: no tenant databases discovered on $container" >&2
    return 1
  fi

  echo ">>> Discovered ${#TENANT_DBS[@]} database(s) for deploy:"
  for db in "${TENANT_DBS[@]}"; do
    echo "      - $db"
  done

  # Registry DB missing on postgres → deploy must fail
  local reg db_exists
  for reg in "${registry[@]}"; do
    db_exists=$(docker exec "$container" psql -U postgres -d postgres -t -A -c \
      "SELECT 1 FROM pg_database WHERE datname = '$reg';" 2>/dev/null | tr -d '\r[:space:]')
    if [ "$db_exists" != "1" ]; then
      echo ">>> FATAL: tenants registry lists '$reg' but database does not exist on postgres" >&2
      return 1
    fi
  done

  # Orphan pos_tenant_* not in registry → warn only (legacy/orphan DBs still get migrations)
  if [ "${#registry[@]}" -gt 0 ]; then
    for db in "${discovered[@]}"; do
      case "$db" in
        pos_system|pos_template) continue ;;
        pos_tenant_*)
          if ! printf '%s\n' "${registry[@]}" | grep -qx "$db"; then
            echo ">>> WARN: database '$db' exists on postgres but not in tenants registry (will still migrate)"
          fi
          ;;
      esac
    done
  fi

  return 0
}

# Same exclusion rules as shared/sql/migrate.mjs and tenantMigrationService.ts
# (one-off fix/backfill/debug scripts are NOT part of the versioned deploy chain).
migration_file_allowed() {
  local base
  base=$(basename "$1")
  case "$base" in
    999_rollback*|apply-*|fix_*|backfill_*|debug_*|check-*|show_*|quick_*|final-*|repair_*|test_*|validate_*)
      return 1
      ;;
    *.sql) return 0 ;;
    *) return 1 ;;
  esac
}

# Run pending shared/sql migrations with ON_ERROR_STOP (fail-fast).
# Increments MIGRATION_FAILURES on any error. Returns 0 only if all DBs succeed.
MIGRATION_FAILURES=0

run_migrations_all_tenants() {
  local container="${1:?}"
  local sql_dir="${2:-shared/sql}"

  if [ ! -d "$sql_dir" ]; then
    echo ">>> FATAL: migration directory missing: $sql_dir" >&2
    MIGRATION_FAILURES=$((MIGRATION_FAILURES + 1))
    return 1
  fi

  for DB in "${TENANT_DBS[@]}"; do
    # pos_template is cloned from pos_system (tenantService.ensureTemplateDatabase), not
    # built by replaying 001..515 on an empty DB — that causes mass false failures.
    if [ "$DB" = "pos_template" ]; then
      echo "  [pos_template] SKIP SQL chain (refreshed from pos_system on backend startup / provision)"
      continue
    fi

    local db_exists
    db_exists=$(docker exec "$container" psql -U postgres -d postgres -t -A -c \
      "SELECT 1 FROM pg_database WHERE datname = '$DB';" 2>/dev/null | tr -d '\r[:space:]')
    if [ "$db_exists" != "1" ]; then
      echo "  [$DB] FATAL: database does not exist — skipping would leave tenant behind" >&2
      MIGRATION_FAILURES=$((MIGRATION_FAILURES + 1))
      continue
    fi

    if ! docker exec "$container" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -c \
      "CREATE TABLE IF NOT EXISTS schema_migrations (
         id SERIAL PRIMARY KEY,
         filename TEXT UNIQUE NOT NULL,
         executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
       );" >/dev/null 2>&1; then
      echo "  [$DB] FATAL: cannot ensure schema_migrations table" >&2
      MIGRATION_FAILURES=$((MIGRATION_FAILURES + 1))
      continue
    fi

    for MIGRATION in $(ls "$sql_dir"/*.sql 2>/dev/null | sort); do
      if ! migration_file_allowed "$MIGRATION"; then
        continue
      fi
      local FILENAME
      FILENAME=$(basename "$MIGRATION")

      local APPLIED
      APPLIED=$(docker exec "$container" psql -U postgres -d "$DB" -t -A -c \
        "SELECT COUNT(*)::text FROM schema_migrations WHERE filename = '$FILENAME';" 2>/dev/null | tr -d '\r[:space:]')

      if [ "$APPLIED" = "1" ]; then
        continue
      fi

      echo "  [$DB] Applying $FILENAME ..."
      if docker exec -i "$container" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q < "$MIGRATION" >/dev/null 2>&1; then
        docker exec "$container" psql -U postgres -d "$DB" -q -c \
          "INSERT INTO schema_migrations (filename) VALUES ('$FILENAME') ON CONFLICT DO NOTHING;" >/dev/null 2>&1 \
          || true
        echo "  [$DB] OK $FILENAME"
      else
        echo "  [$DB] FATAL $FILENAME — migration failed (deploy aborted for this DB)" >&2
        docker exec -i "$container" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 < "$MIGRATION" 2>&1 | tail -20 >&2 || true
        MIGRATION_FAILURES=$((MIGRATION_FAILURES + 1))
      fi
    done
  done

  if [ "$MIGRATION_FAILURES" -gt 0 ]; then
    echo ">>> FATAL: $MIGRATION_FAILURES migration error(s) — deploy must not be considered successful" >&2
    return 1
  fi
  return 0
}
