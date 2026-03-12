// Multi-Tenant Connection Pool Manager
// File: SamplePOS.Server/src/db/connectionManager.ts
//
// Manages per-tenant PostgreSQL connection pools.
// Each tenant gets their own database and pool instance.
// The master pool (pos_system) hosts the tenant registry.

import pg from 'pg';
import logger from '../utils/logger.js';

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
}

interface PoolEntry {
  pool: pg.Pool;
  config: TenantPoolConfig;
  lastUsed: number;
  connectionCount: number;
}

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
  private masterPool: pg.Pool | null = null;
  private evictionInterval: ReturnType<typeof setInterval> | null = null;

  // Configuration
  private readonly maxPoolsPerInstance = 50;  // max concurrent tenant pools
  private readonly poolIdleTimeoutMs = 10 * 60 * 1000; // 10 minutes
  private readonly evictionCheckIntervalMs = 60 * 1000; // check every minute
  private readonly defaultMaxConnections = 10; // per-tenant pool size
  private readonly dbUser: string;
  private readonly dbPassword: string;

  constructor() {
    this.dbUser = process.env.DB_USER || 'postgres';
    const dbPass = process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD;
    if (!dbPass && process.env.NODE_ENV === 'production') {
      console.error('FATAL: DB_PASSWORD environment variable is not set. Cannot start in production without it.');
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
   */
  getPool(config: TenantPoolConfig): pg.Pool {
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

    // Create new pool for this tenant — use discrete params to keep password out of logs
    const pool = new Pool({
      host: config.databaseHost,
      port: config.databasePort,
      database: config.databaseName,
      user: this.dbUser,
      password: this.dbPassword,
      max: this.defaultMaxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('connect', (client) => {
      client.query('SET timezone = "UTC"');
    });

    pool.on('error', (err) => {
      logger.error(`Tenant pool error [${config.slug}]`, { tenantId: config.tenantId, error: err.message });
    });

    const entry: PoolEntry = {
      pool,
      config,
      lastUsed: Date.now(),
      connectionCount: 1,
    };

    this.pools.set(config.tenantId, entry);
    logger.info(`Tenant pool created [${config.slug}] → ${config.databaseName}`, {
      tenantId: config.tenantId,
      activePools: this.pools.size,
    });

    return pool;
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
  getStatus(): { tenantId: string; slug: string; lastUsed: number; connectionCount: number }[] {
    const entries: { tenantId: string; slug: string; lastUsed: number; connectionCount: number }[] = [];
    for (const [tenantId, entry] of this.pools) {
      entries.push({
        tenantId,
        slug: entry.config.slug,
        lastUsed: entry.lastUsed,
        connectionCount: entry.connectionCount,
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

// Singleton instance
export const connectionManager = new ConnectionManager();
export default connectionManager;
