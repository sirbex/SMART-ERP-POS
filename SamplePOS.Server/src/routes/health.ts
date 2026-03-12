import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { pool as globalPool } from '../db/pool.js';
import Redis from 'ioredis';

const router = Router();

// Lazy Redis connection for health checks (reused across requests)
let healthRedis: Redis | null = null;
function getHealthRedis(): Redis {
  if (!healthRedis) {
    healthRedis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
    healthRedis.on('error', () => { /* handled per-check */ });
  }
  return healthRedis;
}

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy';
  details?: unknown;
  timestamp: string;
  responseTime?: number;
}

interface SystemHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: HealthCheckResult[];
}

interface LegacyHealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  database: {
    connected: boolean;
    requiredTables: { [key: string]: boolean };
    requiredColumns: { [key: string]: boolean };
  };
  migrations: {
    executed: string[];
    pending: string[];
  };
  warnings: string[];
}

/**
 * Production Health check endpoint - Enhanced for Phase 6
 * GET /api/health
 */
router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const checks: HealthCheckResult[] = [];
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Database health check
    const dbCheck = await checkDatabase(globalPool);
    checks.push(dbCheck);
    if (dbCheck.status === 'unhealthy') {
      overallStatus = 'unhealthy';
    }

    // Memory usage check
    const memoryCheck = checkMemoryUsage();
    checks.push(memoryCheck);
    if (memoryCheck.status === 'unhealthy') {
      overallStatus = 'unhealthy';
    }

    // Redis health check
    const redisCheck = await checkRedis();
    checks.push(redisCheck);
    if (redisCheck.status === 'unhealthy') {
      overallStatus = overallStatus === 'unhealthy' ? 'unhealthy' : 'degraded';
    }

    // Database schema validation check
    const schemaCheck = await checkDatabaseSchema();
    checks.push(schemaCheck);
    if (schemaCheck.status === 'unhealthy') {
      overallStatus = 'unhealthy';
    }

    const response: SystemHealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      uptime: process.uptime(),
      checks
    };

    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json({
      success: overallStatus !== 'unhealthy',
      data: response
    });

  } catch (error) {
    const errorResponse: SystemHealthResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      uptime: process.uptime(),
      checks: [{
        service: 'health-check',
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime
      }]
    };

    res.status(503).json({
      success: false,
      data: errorResponse,
      error: 'Health check failed'
    });
  }
});

/**
 * Legacy health check endpoint - Maintains backward compatibility
 * GET /api/health/legacy
 */
router.get('/legacy', async (req: Request, res: Response) => {
  const result: LegacyHealthCheckResult = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: {
      connected: false,
      requiredTables: {},
      requiredColumns: {},
    },
    migrations: {
      executed: [],
      pending: [],
    },
    warnings: [],
  };

  try {
    // Check database connection
    await globalPool.query('SELECT 1');
    result.database.connected = true;

    // Check required tables
    const requiredTables = [
      'products',
      'purchase_orders',
      'purchase_order_items',
      'goods_receipts',
      'goods_receipt_items',
      'sales',
      'sale_items',
      'inventory_batches',
      'stock_movements',
      'product_uoms',
      'uoms',
    ];

    for (const table of requiredTables) {
      const tableCheck = await globalPool.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table]
      );
      result.database.requiredTables[table] = tableCheck.rows[0].exists;
      if (!tableCheck.rows[0].exists) {
        result.status = 'unhealthy';
        result.warnings.push(`Table '${table}' does not exist`);
      }
    }

    // Check critical columns
    const criticalColumns = [
      { table: 'purchase_order_items', column: 'uom_id' },
      { table: 'purchase_order_items', column: 'received_quantity' },
      { table: 'goods_receipt_items', column: 'po_item_id' },
      { table: 'goods_receipt_items', column: 'uom_id' },
      { table: 'sales', column: 'sale_number' },
      { table: 'goods_receipts', column: 'receipt_number' },
      { table: 'inventory_batches', column: 'batch_number' },
      { table: 'product_uoms', column: 'conversion_factor' },
    ];

    for (const { table, column } of criticalColumns) {
      const columnCheck = await globalPool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = $2
        )`,
        [table, column]
      );
      const key = `${table}.${column}`;
      result.database.requiredColumns[key] = columnCheck.rows[0].exists;
      if (!columnCheck.rows[0].exists) {
        result.status = 'unhealthy';
        result.warnings.push(`Column '${key}' does not exist`);
      }
    }

    // Check for data integrity issues
    const integrityChecks = [
      {
        name: 'Old batch format',
        query: `SELECT COUNT(*) FROM inventory_batches WHERE batch_number LIKE 'BATCH-176%'`,
        isWarning: true,
      },
      {
        name: 'Products without UOMs',
        query: `SELECT COUNT(*) FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id)`,
        isWarning: true,
      },
      {
        name: 'PENDING POs with completed GRs',
        query: `SELECT COUNT(*) FROM purchase_orders po WHERE po.status = 'PENDING' AND EXISTS (SELECT 1 FROM goods_receipts gr WHERE gr.purchase_order_id = po.id AND gr.status = 'COMPLETED')`,
        isWarning: true,
      },
    ];

    for (const check of integrityChecks) {
      const checkResult = await globalPool.query(check.query);
      const count = parseInt(checkResult.rows[0].count);
      if (count > 0) {
        result.warnings.push(`${check.name}: ${count} records`);
      }
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    result.status = 'unhealthy';
    result.warnings.push(`Database error: ${(error instanceof Error ? error.message : String(error))}`);

    res.status(503).json({
      success: false,
      data: result,
      error: 'System health check failed',
    });
  }
});

/**
 * Readiness probe endpoint
 * GET /api/health/ready
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check if database is accessible
    await globalPool.query('SELECT 1');

    res.json({
      success: true,
      data: {
        status: 'ready',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      data: {
        status: 'not-ready',
        timestamp: new Date().toISOString()
      },
      error: 'Service not ready'
    });
  }
});

/**
 * Liveness probe endpoint
 * GET /api/health/live
 */
router.get('/live', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
});

// Database health check function
async function checkDatabase(dbPool: Pool): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    const result = await dbPool.query('SELECT NOW() as current_time');
    const responseTime = Date.now() - startTime;

    return {
      service: 'postgresql',
      status: 'healthy',
      details: {
        responseTime: `${responseTime}ms`,
        timestamp: result.rows[0].current_time
      },
      timestamp: new Date().toISOString(),
      responseTime
    };
  } catch (error) {
    return {
      service: 'postgresql',
      status: 'unhealthy',
      details: {
        error: error instanceof Error ? error.message : 'Database connection failed',
        responseTime: `${Date.now() - startTime}ms`
      },
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime
    };
  }
}

// Redis health check function
async function checkRedis(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    const redis = getHealthRedis();
    if (redis.status !== 'ready') {
      await redis.connect();
    }
    const pong = await redis.ping();
    const responseTime = Date.now() - startTime;

    return {
      service: 'redis',
      status: pong === 'PONG' ? 'healthy' : 'unhealthy',
      details: { responseTime: `${responseTime}ms` },
      timestamp: new Date().toISOString(),
      responseTime
    };
  } catch (error) {
    // Discard the broken client so the next check creates a fresh one
    if (healthRedis) {
      try { healthRedis.disconnect(); } catch { /* already disconnected */ }
      healthRedis = null;
    }
    return {
      service: 'redis',
      status: 'unhealthy',
      details: {
        error: error instanceof Error ? error.message : 'Redis connection failed',
        responseTime: `${Date.now() - startTime}ms`
      },
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime
    };
  }
}

// Memory usage check function
function checkMemoryUsage(): HealthCheckResult {
  const usage = process.memoryUsage();
  const totalMem = usage.heapTotal;
  const usedMem = usage.heapUsed;
  const memoryUsagePercentage = (usedMem / totalMem) * 100;

  const status = memoryUsagePercentage > 90 ? 'unhealthy' : 'healthy';

  return {
    service: 'memory',
    status,
    details: {
      heapUsed: `${Math.round(usedMem / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(totalMem / 1024 / 1024)}MB`,
      usagePercentage: `${memoryUsagePercentage.toFixed(1)}%`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`
    },
    timestamp: new Date().toISOString()
  };
}

// Database schema validation check function
async function checkDatabaseSchema(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    let hasIssues = false;
    const details: { tables: Record<string, boolean>; columns: Record<string, boolean>; integrityWarnings: string[] } = {
      tables: {},
      columns: {},
      integrityWarnings: []
    };

    // Check required tables
    const requiredTables = [
      'products', 'purchase_orders', 'purchase_order_items',
      'goods_receipts', 'goods_receipt_items', 'sales', 'sale_items',
      'inventory_batches', 'stock_movements', 'product_uoms', 'uoms'
    ];

    for (const table of requiredTables) {
      const tableCheck = await globalPool.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table]
      );
      details.tables[table] = tableCheck.rows[0].exists;
      if (!tableCheck.rows[0].exists) {
        hasIssues = true;
      }
    }

    // Check critical columns
    const criticalColumns = [
      { table: 'purchase_order_items', column: 'uom_id' },
      { table: 'goods_receipt_items', column: 'po_item_id' },
      { table: 'sales', column: 'sale_number' },
      { table: 'inventory_batches', column: 'batch_number' }
    ];

    for (const { table, column } of criticalColumns) {
      const columnCheck = await globalPool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = $2
        )`,
        [table, column]
      );
      const key = `${table}.${column}`;
      details.columns[key] = columnCheck.rows[0].exists;
      if (!columnCheck.rows[0].exists) {
        hasIssues = true;
      }
    }

    return {
      service: 'database-schema',
      status: hasIssues ? 'unhealthy' : 'healthy',
      details,
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    return {
      service: 'database-schema',
      status: 'unhealthy',
      details: {
        error: error instanceof Error ? error.message : 'Schema check failed'
      },
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime
    };
  }
}

// ============================================================
// METRICS ENDPOINT - Prometheus text format
// GET /api/health/metrics
// ============================================================

// Simple in-memory counters (reset on restart — sufficient for single-instance)
const counters = {
  httpRequestsTotal: 0,
  httpErrorsTotal: 0,
  salesCreatedTotal: 0,
  bankingRetriesTotal: 0,
};
const metricsStartTime = Date.now();

/** Increment a counter from anywhere in the app */
export function incrementMetric(name: keyof typeof counters) {
  counters[name]++;
}

/** Disconnect the health-check Redis client (call during shutdown) */
export async function closeHealthRedis(): Promise<void> {
  if (healthRedis) {
    await healthRedis.quit().catch(() => { });
    healthRedis = null;
  }
}

router.get('/metrics', async (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  const uptime = process.uptime();

  // DB connection pool stats
  let dbPoolTotal = 0;
  let dbPoolIdle = 0;
  let dbPoolWaiting = 0;
  try {
    dbPoolTotal = globalPool.totalCount;
    dbPoolIdle = globalPool.idleCount;
    dbPoolWaiting = globalPool.waitingCount;
  } catch { /* pool not available */ }

  // Prometheus text exposition format
  const lines = [
    '# HELP process_uptime_seconds Process uptime in seconds',
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${uptime.toFixed(0)}`,
    '',
    '# HELP process_heap_bytes Process heap memory usage',
    '# TYPE process_heap_bytes gauge',
    `process_heap_bytes{type="used"} ${mem.heapUsed}`,
    `process_heap_bytes{type="total"} ${mem.heapTotal}`,
    '',
    '# HELP process_rss_bytes Resident set size',
    '# TYPE process_rss_bytes gauge',
    `process_rss_bytes ${mem.rss}`,
    '',
    '# HELP db_pool_connections Database connection pool',
    '# TYPE db_pool_connections gauge',
    `db_pool_connections{state="total"} ${dbPoolTotal}`,
    `db_pool_connections{state="idle"} ${dbPoolIdle}`,
    `db_pool_connections{state="waiting"} ${dbPoolWaiting}`,
    '',
    '# HELP app_http_requests_total Total HTTP requests served',
    '# TYPE app_http_requests_total counter',
    `app_http_requests_total ${counters.httpRequestsTotal}`,
    '',
    '# HELP app_http_errors_total Total HTTP 5xx errors',
    '# TYPE app_http_errors_total counter',
    `app_http_errors_total ${counters.httpErrorsTotal}`,
    '',
    '# HELP app_sales_created_total Total sales created',
    '# TYPE app_sales_created_total counter',
    `app_sales_created_total ${counters.salesCreatedTotal}`,
    '',
    '# HELP app_banking_retries_total Banking operations queued for retry',
    '# TYPE app_banking_retries_total counter',
    `app_banking_retries_total ${counters.bankingRetriesTotal}`,
  ];

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(lines.join('\n') + '\n');
});

export default router;
