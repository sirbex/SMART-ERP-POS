// Multi-Tenant Connection Pool Manager
// File: SamplePOS.Server/src/db/connectionManager.ts
//
// Manages per-tenant PostgreSQL connection pools.
// Each tenant gets their own database and pool instance.
// The master pool (pos_system) hosts the tenant registry.

import pg from 'pg';
import logger from '../utils/logger.js';
import type { TenantPlan } from '../../../shared/types/tenant.js';

const { Pool } = pg;

// Override DATE type parser globally (same as pool.ts)
const types = pg.types;
const DATATYPE_DATE = 1082;
types.setTypeParser(DATATYPE_DATE, (val: string) => val);

export interface TenantPoolConfig {
  tenantId: string;
  slug: string;
  databaseName: string;
  databaseHost: string;
  databasePort: number;
  plan?: TenantPlan;
  replicaHost?: string;
  replicaPort?: number;
}

interface PoolEntry {
  pool: pg.Pool;
  readPool?: pg.Pool; // read-replica pool (if configured)
  config: TenantPoolConfig;
  lastUsed: number;
  connectionCount: number;
}

// ── Adaptive Pool Sizing ──────────────────────────────────
// Pool connections scale with tenant plan to avoid the 50×10 = 500
// connection ceiling when hundreds of tenants are active.

const PLAN_POOL_SIZES: Record<string, number> = {
  FREE: 3,
  STARTER: 5,
  PROFESSIONAL: 10,
  ENTERPRISE: 20,
};
const DEFAULT_POOL_SIZE = 5;

// ── Circuit Breaker ───────────────────────────────────────
// Per-tenant health tracking: prevents cascading failures when a tenant DB is down.
// States: CLOSED (healthy) → OPEN (failing, reject fast) → HALF_OPEN (probe one request)

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerEntry {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  openedAt: number;
}

const CIRCUIT_FAILURE_THRESHOLD = 5; // consecutive failures before opening
const CIRCUIT_COOLDOWN_MS = 30_000; // 30s before trying again (half-open)

/**
 * ConnectionManager: manages per-tenant database connection pools
 *
 * - Lazily creates pools on first access
 * - Caches pools for reuse
 * - Evicts idle pools after configurable timeout
 * - Thread-safe (single Node.js event loop)
 */
class ConnectionManager {
  private pools: Map<string, PoolEntry> = new Map();
  private circuits: Map<string, CircuitBreakerEntry> = new Map();
  private masterPool: pg.Pool | null = null;
  private evictionInterval: ReturnType<typeof setInterval> | null = null;

  // Configuration
  private readonly maxPoolsPerInstance = 50; // max concurrent tenant pools
  private readonly poolIdleTimeoutMs = 10 * 60 * 1000; // 10 minutes
  private readonly evictionCheckIntervalMs = 60 * 1000; // check every minute
  private readonly defaultMaxConnections = 10; // per-tenant pool size
  private readonly dbUser: string;
  private readonly dbPassword: string;

  constructor() {
    this.dbUser = process.env.DB_USER || 'postgres';
    const dbPass = process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD;
    if (!dbPass && process.env.NODE_ENV === 'production') {
      console.error(
        'FATAL: DB_PASSWORD environment variable is not set. Cannot start in production without it.'
      );
      process.exit(1);
    }
    this.dbPassword = dbPass || 'password';

    // Start idle pool eviction
    this.evictionInterval = setInterval(() => {
      this.evictIdlePools();
    }, this.evictionCheckIntervalMs);

    // Don't prevent Node.js from exiting
    if (this.evictionInterval.unref) {
      this.evictionInterval.unref();
    }
  }

  /**
   * Get or create the master pool (pos_system database — tenant registry)
   */
  getMasterPool(): pg.Pool {
    if (!this.masterPool) {
      // Use individual params to avoid password appearing in connection string errors
      const poolConfig = process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
          host: 'localhost',
          port: 5432,
          database: 'pos_system',
          user: this.dbUser,
          password: this.dbPassword,
        };

      this.masterPool = new Pool({
        ...poolConfig,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.masterPool.on('connect', (client) => {
        client.query('SET timezone = "UTC"');
      });

      this.masterPool.on('error', (err) => {
        logger.error('Master pool error', { error: err.message });
      });

      logger.info('Master connection pool created (pos_system)');
    }

    return this.masterPool;
  }

  /**
   * Get a connection pool for a specific tenant.
   * Creates the pool if it doesn't exist.
   * Respects circuit breaker — rejects immediately if tenant DB is marked unhealthy.
   */
  getPool(config: TenantPoolConfig): pg.Pool {
    // Circuit breaker: fast-fail if tenant DB is known to be down
    const circuit = this.circuits.get(config.tenantId);
    if (circuit && circuit.state === 'OPEN') {
      const elapsed = Date.now() - circuit.openedAt;
      if (elapsed < CIRCUIT_COOLDOWN_MS) {
        throw new TenantUnavailableError(
          config.slug,
          Math.ceil((CIRCUIT_COOLDOWN_MS - elapsed) / 1000)
        );
      }
      // Cooldown expired → transition to HALF_OPEN (allow one probe)
      circuit.state = 'HALF_OPEN';
      logger.info(`Circuit half-open for tenant [${config.slug}], allowing probe request`, {
        tenantId: config.tenantId,
      });
    }

    const existing = this.pools.get(config.tenantId);
    if (existing) {
      existing.lastUsed = Date.now();
      existing.connectionCount++;
      return existing.pool;
    }

    // Check pool limit
    if (this.pools.size >= this.maxPoolsPerInstance) {
      this.evictLeastRecentlyUsed();
    }

    // Adaptive pool sizing: allocate connections based on tenant plan
    const maxConns = PLAN_POOL_SIZES[config.plan ?? ''] ?? DEFAULT_POOL_SIZE;

    // Create new pool for this tenant — use discrete params to keep password out of logs
    const pool = new Pool({
      host: config.databaseHost,
      port: config.databasePort,
      database: config.databaseName,
      user: this.dbUser,
      password: this.dbPassword,
      max: maxConns,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('connect', (client) => {
      client.query('SET timezone = "UTC"');
    });

    pool.on('error', (err) => {
      logger.error(`Tenant pool error [${config.slug}]`, {
        tenantId: config.tenantId,
        error: err.message,
      });
    });

    // Read replica pool (optional — for reports/dashboards)
    let readPool: pg.Pool | undefined;
    if (config.replicaHost) {
      const readConns = Math.max(2, Math.ceil(maxConns * 0.6));
      readPool = new Pool({
        host: config.replicaHost,
        port: config.replicaPort ?? config.databasePort,
        database: config.databaseName,
        user: this.dbUser,
        password: this.dbPassword,
        max: readConns,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
      readPool.on('connect', (client) => {
        client.query('SET timezone = "UTC"');
      });
      readPool.on('error', (err) => {
        logger.error(`Tenant read-replica pool error [${config.slug}]`, {
          tenantId: config.tenantId,
          error: err.message,
        });
      });
    }

    const entry: PoolEntry = {
      pool,
      readPool,
      config,
      lastUsed: Date.now(),
      connectionCount: 1,
    };

    this.pools.set(config.tenantId, entry);
    logger.info(
      `Tenant pool created [${config.slug}] → ${config.databaseName} (max=${maxConns}${readPool ? ', +replica' : ''})`,
      {
        tenantId: config.tenantId,
        plan: config.plan ?? 'unknown',
        activePools: this.pools.size,
      }
    );

    return pool;
  }

  // ── Circuit Breaker API ──────────────────────────────────

  /**
   * Record a successful query — resets the circuit to CLOSED.
   */
  recordSuccess(tenantId: string): void {
    const circuit = this.circuits.get(tenantId);
    if (circuit && circuit.state !== 'CLOSED') {
      const entry = this.pools.get(tenantId);
      logger.info(`Circuit closed for tenant [${entry?.config.slug ?? tenantId}] — DB recovered`, {
        tenantId,
        previousState: circuit.state,
      });
    }
    this.circuits.delete(tenantId); // healthy → no entry needed
  }

  /**
   * Record a connection/query failure — may trip the circuit to OPEN.
   */
  recordFailure(tenantId: string): void {
    let circuit = this.circuits.get(tenantId);
    if (!circuit) {
      circuit = { state: 'CLOSED', failureCount: 0, lastFailureAt: 0, openedAt: 0 };
      this.circuits.set(tenantId, circuit);
    }

    circuit.failureCount++;
    circuit.lastFailureAt = Date.now();

    if (circuit.state === 'HALF_OPEN' || circuit.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
      circuit.state = 'OPEN';
      circuit.openedAt = Date.now();
      const entry = this.pools.get(tenantId);
      logger.warn(
        `Circuit OPEN for tenant [${entry?.config.slug ?? tenantId}] — fast-failing requests`,
        {
          tenantId,
          failureCount: circuit.failureCount,
          cooldownSec: CIRCUIT_COOLDOWN_MS / 1000,
        }
      );
    }
  }

  /**
   * Get circuit breaker state for a tenant (for health/status endpoints).
   */
  getCircuitState(tenantId: string): CircuitState {
    return this.circuits.get(tenantId)?.state ?? 'CLOSED';
  }

  /**
   * Pre-warm a tenant pool: creates the pool in advance so the first real
   * request doesn't pay cold-start latency. Safe to call multiple times.
   */
  preWarm(config: TenantPoolConfig): void {
    if (this.pools.has(config.tenantId)) return; // already warm
    this.getPool(config); // creates and caches the pool
    logger.info(`Pre-warmed tenant pool [${config.slug}]`, { tenantId: config.tenantId });
  }

  /**
   * Get pool by tenant ID (must have been created previously via getPool)
   */
  getPoolById(tenantId: string): pg.Pool | undefined {
    const entry = this.pools.get(tenantId);
    if (entry) {
      entry.lastUsed = Date.now();
      return entry.pool;
    }
    return undefined;
  }

  /**
   * Get the read-replica pool for a tenant (falls back to primary if no replica configured).
   * Use for read-heavy workloads: reports, dashboards, search.
   */
  getReadPool(tenantId: string): pg.Pool | undefined {
    const entry = this.pools.get(tenantId);
    if (entry) {
      entry.lastUsed = Date.now();
      return entry.readPool ?? entry.pool;
    }
    return undefined;
  }

  /**
   * Check if a pool exists for a tenant
   */
  hasPool(tenantId: string): boolean {
    return this.pools.has(tenantId);
  }

  /**
   * Get active pool count
   */
  getActivePoolCount(): number {
    return this.pools.size;
  }

  /**
   * Get status of all pools
   */
  getStatus(): {
    tenantId: string;
    slug: string;
    plan: string;
    lastUsed: number;
    connectionCount: number;
    hasReplica: boolean;
  }[] {
    const entries: {
      tenantId: string;
      slug: string;
      plan: string;
      lastUsed: number;
      connectionCount: number;
      hasReplica: boolean;
    }[] = [];
    for (const [tenantId, entry] of this.pools) {
      entries.push({
        tenantId,
        slug: entry.config.slug,
        plan: entry.config.plan ?? 'unknown',
        lastUsed: entry.lastUsed,
        connectionCount: entry.connectionCount,
        hasReplica: !!entry.readPool,
      });
    }
    return entries;
  }

  /**
   * Remove and close a specific tenant's pool
   */
  async removePool(tenantId: string): Promise<void> {
    const entry = this.pools.get(tenantId);
    if (entry) {
      try {
        await entry.pool.end();
        if (entry.readPool) await entry.readPool.end();
        this.pools.delete(tenantId);
        logger.info(`Tenant pool removed [${entry.config.slug}]`, { tenantId });
      } catch (err) {
        logger.error(`Error closing tenant pool [${entry.config.slug}]`, { tenantId, error: err });
      }
    }
  }

  /**
   * Evict pools that haven't been used recently
   */
  private evictIdlePools(): void {
    const now = Date.now();
    const toEvict: string[] = [];

    for (const [tenantId, entry] of this.pools) {
      if (now - entry.lastUsed > this.poolIdleTimeoutMs) {
        toEvict.push(tenantId);
      }
    }

    for (const tenantId of toEvict) {
      const entry = this.pools.get(tenantId);
      if (entry) {
        entry.pool.end().catch((err) => {
          logger.error(`Error evicting pool [${entry.config.slug}]`, { error: err });
        });
        if (entry.readPool) {
          entry.readPool.end().catch((err) => {
            logger.error(`Error evicting read-replica pool [${entry.config.slug}]`, { error: err });
          });
        }
        this.pools.delete(tenantId);
        logger.info(`Evicted idle tenant pool [${entry.config.slug}]`, { tenantId });
      }
    }

    if (toEvict.length > 0) {
      logger.info(`Evicted ${toEvict.length} idle pools, ${this.pools.size} remaining`);
    }
  }

  /**
   * Evict the least recently used pool when at capacity
   */
  private evictLeastRecentlyUsed(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [tenantId, entry] of this.pools) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestId = tenantId;
      }
    }

    if (oldestId) {
      const entry = this.pools.get(oldestId);
      if (entry) {
        entry.pool.end().catch((err) => {
          logger.error(`Error evicting LRU pool [${entry.config.slug}]`, { error: err });
        });
        if (entry.readPool) {
          entry.readPool.end().catch(() => { });
        }
        this.pools.delete(oldestId);
        logger.info(`Evicted LRU tenant pool [${entry.config.slug}]`);
      }
    }
  }

  /**
   * Gracefully close all pools (for server shutdown)
   */
  async shutdown(): Promise<void> {
    if (this.evictionInterval) {
      clearInterval(this.evictionInterval);
    }

    const closePromises: Promise<void>[] = [];

    for (const [tenantId, entry] of this.pools) {
      closePromises.push(
        entry.pool.end().catch((err) => {
          logger.error(`Error closing pool [${entry.config.slug}]`, { error: err });
        })
      );
      if (entry.readPool) {
        closePromises.push(
          entry.readPool.end().catch((err) => {
            logger.error(`Error closing read-replica pool [${entry.config.slug}]`, { error: err });
          })
        );
      }
    }

    if (this.masterPool) {
      closePromises.push(
        this.masterPool.end().catch((err) => {
          logger.error('Error closing master pool', { error: err });
        })
      );
    }

    await Promise.all(closePromises);
    this.pools.clear();
    this.masterPool = null;
    logger.info('All connection pools closed');
  }
}

// ── Tenant Unavailable Error ──────────────────────────────
// Thrown by circuit breaker when a tenant DB is known to be down.
// Middleware catches this and returns 503.

export class TenantUnavailableError extends Error {
  public readonly retryAfterSec: number;
  public readonly slug: string;

  constructor(slug: string, retryAfterSec: number) {
    super(`Tenant database [${slug}] is temporarily unavailable. Retry after ${retryAfterSec}s.`);
    this.name = 'TenantUnavailableError';
    this.slug = slug;
    this.retryAfterSec = retryAfterSec;
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager();
export default connectionManager;
