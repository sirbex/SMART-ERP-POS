# Deployment & migrations — how Copilot / production was designed

**Authority for production updates:** [`DEPLOYMENT_CONTRACT.md`](DEPLOYMENT_CONTRACT.md)  
**Copilot agent rules:** [`.github/copilot-instructions.md`](.github/copilot-instructions.md), [`copilot.md`](copilot.md)  
**Safety narrative (CI layers):** [`DEPLOYMENT_MIGRATION_SAFETY.md`](DEPLOYMENT_MIGRATION_SAFETY.md)

This document maps **all paths** so deploy work stays consistent with what Copilot was told to do.

---

## Production update path (the only one that matters on 209.38.203.138)

```
GitHub push main → .github/workflows/deploy-production.yml
                 → SSH root@209.38.203.138
                 → cd /opt/smarterp && git stash && bash scripts/deploy-update.sh
```

**Not** `deploy.sh` (that script is a **fresh install** dev compose flow — never use on live data).

### What `deploy-update.sh` does

1. Resolve postgres/nginx/backend container names (`smarterp-*` or `samplepos-*`)
2. **Discover all databases** (`scripts/lib/discover-tenant-databases.sh`):
   - `pos_system`, `pos_template`, every `pos_tenant_*` on the instance
   - Plus every `tenants.database_name` in `pos_system` (non-deleted)
3. Pre-deploy row-count snapshot (integrity guard)
4. `git pull`
5. **Fail-fast migrations** on every discovered DB (`ON_ERROR_STOP=1`, same file filter as `migrate.mjs`)
6. Optional `node scripts/proof-all-tenants-migrations.mjs`
7. `docker compose -f docker-compose.deploy.yml build` backend + frontend only
8. `up -d --no-deps` backend + frontend (postgres/redis volumes untouched)
9. `nginx -s reload` (mandatory — avoids 502 from stale upstream IP)
10. Health checks + post-deploy row-count compare (exit 1 if rows lost)

---

## Three ways migrations run (must stay aligned)

| Runner | When | Which DBs | File filter | On failure |
|--------|------|-----------|-------------|------------|
| `shared/sql/migrate.mjs` | Dev CLI `npm run migrate` | `DATABASE_URL` (one DB) | Excludes `fix_*`, `backfill_*`, `apply-*`, `999_rollback*` | Stop, exit 1 |
| `shared/sql/migrate-tenants.mjs` | Dev CLI `npm run migrate:tenants` | `tenants` WHERE `status='ACTIVE'` | Same as migrate.mjs | Per-tenant fail, exit 1 |
| `tenantMigrationService` | Backend startup + first request per tenant | ACTIVE tenants from registry | Same as migrate.mjs | Log error; startup lists failed slugs |
| `deploy-update.sh` | Every production deploy | **All discovered DBs** (see above) | **Same as migrate.mjs** | Stop deploy before app rebuild |

**Tracking table:** `schema_migrations(filename, checksum)` — idempotent deploy ledger.  
**Version marker:** `schema_version` + `CURRENT_SCHEMA_VERSION` in `SamplePOS.Server/src/constants/schemaVersion.ts` (515) — used to decide if a tenant is “behind”; actual SQL applied is still **per filename** from `shared/sql/`.

**Do not** run `npm run seed` or init SQL on production ([`DEPLOYMENT_CONTRACT.md`](DEPLOYMENT_CONTRACT.md) rule 6).

---

## Tenant template (`pos_template`) — how new tenants get schema

Documented in `tenantService.ensureTemplateDatabase()`:

1. **`pos_template`** holds schema (+ seed rows for accounts, UoMs, RBAC catalog) cloned from **`pos_system`** via `pg_dump --schema-only` (platform tables excluded).
2. **New tenant:** `CREATE DATABASE pos_tenant_<slug> TEMPLATE pos_template` (instant clone).
3. Therefore **every deploy must migrate `pos_template`** as well as `pos_system` and all `pos_tenant_*` — otherwise new tenants start on an old schema.

Registry table: `pos_system.tenants` (`database_name`, `database_host`, `database_port`, `status`).

---

## What Copilot was doing wrong in practice (forensic)

| Issue | Symptom |
|-------|---------|
| Hardcoded 2 DB names in `deploy-update.sh` | `acme`, `blis`, `dynamics`, etc. never got SQL on deploy |
| Wrong postgres container name | `smarterp-postgres` vs `samplepos-postgres` → migrations no-op, deploy still “green” |
| `continuing` on migration errors | GitHub Actions success while tenants stayed behind |
| Deploy ran **all** `*.sql` | Unlike `migrate.mjs`, could re-run one-off `fix_*` / `repair_*` scripts |
| RBAC SQL (e.g. `073_*.sql`) only in files | Never applied if migrate step failed; **no seed in production** |
| `migrate:tenants` ≠ full deploy set | CLI tool only hits ACTIVE registry rows, not orphans or `pos_template` |

---

## Verification commands (runtime truth)

On server after pull:

```bash
cd /opt/smarterp
bash scripts/deploy-update.sh   # must list ALL discovered DBs and exit 0

POSTGRES_CONTAINER=samplepos-postgres node scripts/proof-all-tenants-migrations.mjs

bash check_migration_status.sh
```

Per-tenant UI/API proof remains separate (`proof-adjust-button-live.mjs`, etc.).

---

## Related files (quick index)

| File | Role |
|------|------|
| `docker-compose.deploy.yml` | Update-only compose; `container_name: smarterp-postgres` |
| `scripts/deploy-update.sh` | Production update orchestrator |
| `scripts/lib/discover-tenant-databases.sh` | All-tenant discovery + migrate |
| `scripts/verify-deploy-safety.ps1` | Pre/post row counts via SSH |
| `shared/sql/000_schema_migrations.sql` | Bootstrap tracking table |
| `shared/sql/migrate.mjs` | Single-DB dev runner |
| `shared/sql/migrate-tenants.mjs` | Registry ACTIVE tenants dev runner |
| `SamplePOS.Server/src/modules/system/tenantMigrationService.ts` | Runtime + startup sync |
| `SamplePOS.Server/src/modules/platform/tenantService.ts` | `pos_template` + provisioning |

**Last aligned:** May 2026 — deploy discovery + migrate filter matched to `migrate.mjs`.
