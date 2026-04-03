import type { Pool, PoolClient } from 'pg';

/**
 * Read / write the schema_version table.
 *
 * getSchemaVersion returns 0 if the table does not yet exist —
 * this lets the migration service know the DB has never been versioned
 * and needs a full migration run.
 */
export const schemaVersionRepository = {
    async getSchemaVersion(client: Pool | PoolClient): Promise<number> {
        try {
            const { rows } = await client.query(
                `SELECT COALESCE(MAX(version), 0) AS version FROM schema_version`
            );
            return rows[0]?.version ?? 0;
        } catch (err: unknown) {
            // Table doesn't exist yet → version 0
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('does not exist')) {
                return 0;
            }
            throw err;
        }
    },

    async setSchemaVersion(client: Pool | PoolClient, version: number): Promise<void> {
        await client.query(
            `INSERT INTO schema_version (version) VALUES ($1)`,
            [version]
        );
    },
};
