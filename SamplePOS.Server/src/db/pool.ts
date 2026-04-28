// Database Connection - PostgreSQL
// Manages connection pool for the application

import pg from 'pg';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

const { Pool } = pg;

// ============================================================
// TIMEZONE STRATEGY: UTC EVERYWHERE
// ============================================================
// CRITICAL: All timestamps stored in UTC in database
// Frontend handles timezone conversion for display only
// Date filters use UTC full-day ranges (00:00:00Z to 23:59:59Z)
// ============================================================

// Override the DATE type parser to return raw string (YYYY-MM-DD)
// Prevents node-postgres from converting DATE to Date object at midnight UTC
// which causes timezone shift issues for users ahead of UTC
const types = pg.types;
const DATATYPE_DATE = 1082; // PostgreSQL DATE type OID

types.setTypeParser(DATATYPE_DATE, (val: string) => {
  // Return the date string as-is in YYYY-MM-DD format
  // This prevents timezone conversion for DATE fields (sale_date, expiry_date, etc.)
  return val;
});

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,
  min: 5, // Keep warm connections to eliminate cold-start latency
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // 10s to wait for free connection under load
});

// Set session timezone to UTC for all connections
// Also set statement_timeout to prevent runaway queries
pool.on('connect', (client) => {
  client.query("SET timezone = 'UTC'; SET statement_timeout = '30s'")
    .catch(err => logger.error('Failed to configure session settings on new connection', { err }));
  logger.info('Database connected | Strategy: UTC everywhere | DATE parser: string');
});

pool.on('error', (err) => {
  logger.error('Database pool error (connection will be retried)', { error: err.message });
});

export async function testConnection(): Promise<boolean> {
  const maxRetries = Number(process.env.DB_CONNECT_RETRIES) || 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await pool.query('SELECT NOW()');
      logger.info('Database connection test successful', { now: result.rows[0].now });
      return true;
    } catch (error) {
      const delay = Math.min(1000 * 2 ** (attempt - 1), 16000);
      logger.error(`Database connection attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms`);
      if (attempt === maxRetries) {
        logger.error('All database connection attempts exhausted', { error });
        return false;
      }
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return false;
}

export default pool;
