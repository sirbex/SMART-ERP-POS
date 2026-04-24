# 🚨 PRODUCTION DEPLOYMENT CONTRACT (READ BEFORE ANY DEPLOY)

**This file is instruction memory for Copilot. It is NOT optional documentation.**

This system is already running in production with live tenants and real data.

- **Server**: 209.38.203.138
- **Domain**: wizarddigital-inv.com
- **Repo on server**: /opt/smarterp

---

## RULES COPILOT MUST NEVER BREAK

1. **PostgreSQL database already exists with data.** NEVER recreate DB. NEVER run init SQL.
2. **Docker volumes contain live data.** NEVER remove volumes.
3. **Migrations are incremental only.** NEVER drop or recreate tables.
4. **This is ALWAYS an update deployment, NEVER a fresh install.**
5. **`docker-compose.deploy.yml` is for UPDATE ONLY.**
6. **Seeder scripts must NEVER run in production.**
7. **No `docker-compose down -v`** — this destroys all data.
8. **No `DROP TABLE`, `CREATE DATABASE`, or schema recreation.**
9. **No `docker volume rm`** — volumes hold PostgreSQL and Redis data.
10. **No `--force-recreate` on postgres or redis** — only on backend/frontend.

---

## Correct Deployment Procedure

```bash
# Use the deploy script (preferred — includes nginx reload):
cd /opt/smarterp && bash scripts/deploy-update.sh

# Or manually:
cd /opt/smarterp
git pull
docker compose -f docker-compose.deploy.yml build backend frontend
docker compose -f docker-compose.deploy.yml up -d --no-deps backend frontend

# ⚠️ MANDATORY: reload nginx after EVERY container restart
# (containers get new IPs on recreate; nginx caches the old IP → 502 until reloaded)
docker exec smarterp-nginx nginx -s reload

# Health check path is /api/health (NOT /health)
curl https://wizarddigital-inv.com/api/health
```

**What this does**: Rebuilds and restarts ONLY the application containers (backend + frontend).
**What this does NOT touch**: PostgreSQL, Redis, volumes, networks.
**nginx reload is safe** — it only refreshes upstream IPs, zero downtime.

---

## Database Policy

- Schema evolves via **incremental migrations only** (ALTER TABLE, ADD COLUMN, CREATE TABLE IF NOT EXISTS).
- Existing data must **remain intact** after every deployment.
- All migrations must be **idempotent** (safe to run multiple times).
- Migrations run inside the postgres container: `docker exec samplepos-postgres psql -U postgres -d <db_name> -f /tmp/migration.sql`
- Apply to **ALL tenant databases**: pos_system, pos_tenant_henber_pharmacy, and any future pos_tenant_* databases.

---

## Tenancy Policy

- Tenant databases already exist (`pos_tenant_*`). **Never recreate them.**
- New tenants are provisioned via `POST /api/platform/tenants` (creates DB from pos_template).
- The template database (`pos_template`) can be updated with new migrations.
- **Active tenant databases (March 2026)**: pos_system, pos_tenant_henber_pharmacy.

---

## Forbidden Commands (NEVER RUN THESE)

```bash
# ❌ DESTROYS ALL DATA
docker compose down -v
docker volume rm postgres_data
docker volume rm redis_data

# ❌ RECREATES DATABASE
CREATE DATABASE pos_system;
DROP TABLE anything;
DROP DATABASE anything;

# ❌ RESTARTS DATA CONTAINERS UNNECESSARILY
docker compose up -d --force-recreate postgres
docker compose up -d --force-recreate redis

# ❌ RUNS SEEDERS IN PRODUCTION
npm run seed
node seed.js
psql -f init.sql
psql -f seed.sql
```

---

## Safe Commands (USE THESE)

```bash
# ✅ Pull latest code
git pull

# ✅ Build app containers only
docker compose -f docker-compose.deploy.yml build backend frontend

# ✅ Restart app containers only (--no-deps = don't touch postgres/redis)
docker compose -f docker-compose.deploy.yml up -d --no-deps backend frontend

# ✅ Check status
docker ps --format 'table {{.Names}}\t{{.Status}}'

# ✅ Check logs
docker logs smarterp-backend --tail 30

# ✅ Run incremental migration
docker exec samplepos-postgres psql -U postgres -d pos_system -f /tmp/migration.sql

# ✅ Health check
curl https://wizarddigital-inv.com/api/health
```

---

## Network Note

Redis and Postgres containers may be on `smarterp_samplepos-network` (legacy).
Backend/frontend use `smarterp_app-network`. If backend can't reach Redis/Postgres after recreate:

```bash
docker network connect --alias redis smarterp_app-network samplepos-redis
docker network connect --alias postgres smarterp_app-network samplepos-postgres
```

---

**Last updated**: March 29, 2026
