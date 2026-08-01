import type { Pool, PoolClient } from 'pg';
import { tableHasColumn } from '../../db/schemaColumnCache.js';

type DbConn = Pool | PoolClient;

/** True when migration 580 applied (rolling-deploy safe). */
export async function printJobsTableReady(conn: DbConn): Promise<boolean> {
  return tableHasColumn(conn, 'print_jobs', 'id');
}
