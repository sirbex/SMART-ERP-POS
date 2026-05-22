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

0. **`git pull` then re-exec itself** — required because SSH starts bash with the on-disk script *before* pull; without re-exec, migrations would still use the previous version.
1. Resolve postgres/nginx/backend container names (`smarterp-*` or `samplepos-*`)
2. **Discover all databases** (`scripts/lib/discover-tenant-databases.sh`):
   - `pos_system`, every `pos_tenant_*` on the instance (+ registry merge)
   - `pos_template` is listed for visibility but **SQL migrations skip it** — template schema is cloned from `pos_system` via `tenantService.ensureTemplateDatabase()` (pg_dump), not by replaying `001_*.sql` on an empty DB
3. Pre-deploy row-count snapshot (integrity guard)
4. **Fail-fast migrations** on every discovered DB (`ON_ERROR_STOP=1`, same file filter as `migrate.mjs`)
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
3. **`pos_template` is NOT migrated via the numbered SQL chain** on deploy (that replays `001_*.sql` and fails on a clone). After `pos_system` + all `pos_tenant_*` are migrated, the backend refreshes the template from `pos_system` on startup (`ensureTemplateDatabase`).

Registry table: `pos_system.tenants` (`database_name`, `database_host`, `database_port`, `status`).

---

## Mandatory instructions (agents + operators — moving forward)

These rules come from production forensics (May 2026). Treat them as **non-optional**.

### 1. User-visible truth is the authority

- Do **not** say fixed, deployed, resolved, or working unless **runtime** evidence exists: UI change, API response, DB row, or deploy log line.
- Code merged ≠ production behavior changed.
- GitHub Actions green ≠ migrations ran (historically: wrong container name + script continued on error).

### 2. Trace the real runtime path before changing code

- Find the **exact** route, component, and API file the user hits (e.g. `/customers` → `CustomersPage` → `CustomerDetailModal`, not a similarly named page).
- Confirm server route registration (`server.ts`) and client lazy chunks (feature may live in `CustomersPage-*.js`, not `index-*.js`).
- State target environment: local / henber / all tenants.

### 3. Production deploy — only this procedure

- **Use:** `bash scripts/deploy-update.sh` on `/opt/smarterp` (or GitHub `deploy-production.yml`).
- **Never:** `deploy.sh`, `docker compose down -v`, seeders, `CREATE DATABASE`, recreate postgres/redis.
- Script order matters: **`git pull` → re-exec script** → discover DBs → migrate → build app → nginx reload.

### 4. All tenants — discover, do not hardcode

- Never hardcode `TENANT_DBS=(pos_system pos_tenant_henber_pharmacy)` or similar.
- Use `discover_tenant_databases`: every `pos_tenant_*` on postgres + `tenants.database_name` in `pos_system`.
- If registry lists a DB that does not exist on postgres → **fail deploy**.
- Orphan `pos_tenant_*` not in registry → still migrate (warn only).

### 5. Migrations — same rules everywhere

- Versioned chain only: files tracked in `schema_migrations`, same filter as `migrate.mjs` (exclude `fix_*`, `backfill_*`, `apply-*`, `999_rollback*`, one-off repair/debug scripts).
- **Fail-fast:** `ON_ERROR_STOP=1`; exit non-zero before rebuilding backend/frontend.
- **Skip `pos_template`** in the deploy SQL loop; refresh via `ensureTemplateDatabase` from `pos_system`.
- New RBAC/features need a **numbered** `shared/sql/NNN_*.sql` migration — production does **not** run `seed.ts`.

### 6. Infrastructure names — resolve, do not assume

- Postgres may be `samplepos-postgres` or `smarterp-postgres`; nginx/backend similarly.
- Deploy script must auto-detect running container names.

### 7. Proof hierarchy (what to run and in what order)

| Layer | What proves it |
|--------|----------------|
| Build | `npm run build` / `proof:adjust-button:bundle` (local only) |
| Deploy log | Discovered N DBs, `OK` on pending migrations, no `FATAL`, data snapshot unchanged |
| DB | `proof-all-tenants-migrations.mjs`, `customers.adjust` count, `schema_migrations` row for new file |
| Bundle | Index hash changed; lazy chunk contains API path (scan `index-*.js` imports, not entry chunks only) |
| API | Authenticated call to affected endpoint |
| UI | User or `proof:*:live` with real tenant credentials |

### 8. When behavior does not change — do not repeat the same fix

Investigate instead:

- Wrong component or route
- Stale frontend bundle or browser cache
- Migration never applied (postgres container, script pre-pull, continue-on-error)
- RBAC permission missing in **tenant** DB (not just `permissions.ts`)
- Feature flag / invoice eligibility gating UI
- Duplicate logic elsewhere

### 9. Forensic summary required after deploy work

Always report:

- Files changed; routes/APIs affected
- Which DBs discovered and which migrations applied (filename + OK/FAIL per DB)
- Container names used; whether app containers restarted; index/asset hash if frontend touched
- Runtime verification performed and **evidence** (log lines, proof script output)
- What is **still unverified** (e.g. “henber Adjust button not confirmed in browser”)

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
