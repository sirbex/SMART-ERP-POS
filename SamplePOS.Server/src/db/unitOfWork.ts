/**
 * UnitOfWork - Transaction management utility
 * 
 * Provides a clean abstraction for wrapping multi-step database operations
 * in a single PostgreSQL transaction. Guarantees:
 *   - Automatic BEGIN/COMMIT/ROLLBACK
 *   - Automatic client.release() in finally block
 *   - Type-safe return value
 *   - Zero `any` types
 * 
 * Usage:
 *   const result = await UnitOfWork.run(pool, async (client) => {
 *     const row = await someRepo.create(client, data);
 *     await anotherRepo.update(client, row.id, moreData);
 *     return row;
 *   });
 * 
 * All repository calls inside the callback receive the PoolClient,
 * ensuring they participate in the same transaction.
 */

import { Pool, PoolClient } from 'pg';
import logger from '../utils/logger.js';

/** Connection type accepted by repositories: either a Pool or a transactional PoolClient */
export type DbConnection = Pool | PoolClient;

export class UnitOfWork {
    /**
     * Execute a callback within a single database transaction.
     * 
     * @param pool - The connection pool to acquire a client from
     * @param work - Async callback receiving a transactional PoolClient
     * @returns The value returned by the callback
     * @throws Re-throws any error after rolling back the transaction
     * 
     * The transaction is:
     *   - Committed if the callback completes successfully
     *   - Rolled back if the callback throws
     *   - The client is always released back to the pool
     */
    static async run<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        } catch (error: unknown) {
            await client.query('ROLLBACK').catch((rollbackErr: unknown) => {
                logger.error('UnitOfWork ROLLBACK failed', {
                    rollbackError: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
                    originalError: error instanceof Error ? error.message : String(error),
                });
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Execute a callback within a savepoint (nested transaction).
     * Use this when you need a sub-transaction within an existing UnitOfWork.
     * 
     * @param client - The existing transactional PoolClient
     * @param savepointName - A unique name for the savepoint
     * @param work - Async callback
     * @returns The value returned by the callback
     * @throws Re-throws any error after rolling back to the savepoint
     */
    static async savepoint<T>(
        client: PoolClient,
        savepointName: string,
        work: (client: PoolClient) => Promise<T>
    ): Promise<T> {
        await client.query(`SAVEPOINT ${savepointName}`);
        try {
            const result = await work(client);
            await client.query(`RELEASE SAVEPOINT ${savepointName}`);
            return result;
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`).catch((rollbackErr: unknown) => {
                logger.error('UnitOfWork SAVEPOINT ROLLBACK failed', {
                    savepointName,
                    rollbackError: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
                    originalError: error instanceof Error ? error.message : String(error),
                });
            });
            throw error;
        }
    }
}
