/**
 * Maintenance Mode Guard — replaces check_maintenance_mode trigger
 *
 * Call before write operations on purchase_orders and sales tables.
 * Checks system_maintenance_mode table; throws if maintenance is active.
 */

import { Pool, PoolClient } from 'pg';

export async function checkMaintenanceMode(
    client: Pool | PoolClient
): Promise<void> {
    const result = await client.query(
        `SELECT is_active FROM system_maintenance_mode
     WHERE id = '00000000-0000-0000-0000-000000000001'`
    );

    if (result.rows[0]?.is_active === true) {
        throw new Error('System is in maintenance mode. Please try again later.');
    }
}
