import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

/**
 * PostgreSQL database connection pool
 */
const pool = new Pool({
  // These environment variables are automatically used by pg
  // PGUSER, PGHOST, PGPASSWORD, PGDATABASE, PGPORT
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a connection
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Pool error handling
pool.on('error', (err: Error, client: PoolClient) => {
  logger.error('Unexpected error on idle PostgreSQL client', err);
});

pool.on('connect', () => {
  logger.debug('New client connected to PostgreSQL');
});

/**
 * Execute a query with automatic connection management
 * @param text SQL query text
 * @param params Query parameters
 * @returns Query result
 */
export async function query(text: string, params?: any[]): Promise<any> {
  const start = Date.now();
  
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug(`Executed query: ${text}`);
    logger.debug(`Duration: ${duration}ms, Rows: ${res.rowCount}`);
    
    return res;
  } catch (error) {
    logger.error(`Query error: ${text}`);
    logger.error(`Query params: ${JSON.stringify(params)}`);
    logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns PostgreSQL client
 */
export async function getClient(): Promise<PoolClient> {
  try {
    const client = await pool.connect();
    
    // Monkey patch the client query method to implement logging
    const query = client.query.bind(client);
    const release = client.release.bind(client);

    // Set a timeout of 5 seconds on idle clients
    const timeout = global.setTimeout(() => {
      logger.error('A client has been checked out for too long.');
      logger.error(`The last executed query was: ${(client as any).lastQuery || 'unknown'}`);
    }, 5000);

    // Store the query method and add logging
    client.query = (...args: any[]) => {
      (client as any).lastQuery = args[0];
      return query(...args);
    };

    // Ensure release happens only once and timeout is cleared
    client.release = () => {
      global.clearTimeout(timeout);
      client.query = query;
      client.release = release;
      return release();
    };

    return client;
  } catch (error) {
    logger.error('Error acquiring client from pool', error);
    throw error;
  }
}

export default pool;