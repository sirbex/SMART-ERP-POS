import { Pool } from 'pg';

// Configuration for the PostgreSQL connection pool
const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'samplepos',
  password: process.env.PG_PASSWORD || 'postgres',
  port: parseInt(process.env.PG_PORT || '5432'),
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a connection
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Event listeners for pool 
pool.on('error', (err: Error, _client: any) => {
  console.error('Unexpected error on idle client', err);
  // Prefix with underscore to indicate intentionally unused parameter
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

export default pool;