// Database Connection - PostgreSQL
// Manages connection pool for the application

import pg from 'pg';
import dotenv from 'dotenv';

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
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Set session timezone to UTC for all connections
// This ensures all TIMESTAMP WITH TIMEZONE values are stored/retrieved in UTC
pool.on('connect', (client) => {
  client.query('SET timezone = "UTC"');
  console.log('✅ Database connected | Strategy: UTC everywhere | DATE parser: string');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

export async function testConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection test successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    return false;
  }
}

export default pool;
