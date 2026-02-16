// Sync Engine Service — Edge/On-Premises ↔ Cloud Synchronization
// File: SamplePOS.Server/src/modules/platform/syncService.ts
//
// Handles bidirectional sync between edge nodes (on-premises) and the cloud.
// Strategy:
//   - Sales/financial transactions: additive-only (never overwrite posted GL entries)
//   - Products/customers: last-write-wins with version tracking
//   - Inventory: cloud is source of truth; edge sends deltas

import type pg from 'pg';
import { connectionManager } from '../../db/connectionManager.js';
import { tenantRepository } from './tenantRepository.js';
import type {
  SyncBatch, SyncItem, SyncResult, SyncItemResult, SyncConflict,
} from '../../../../shared/types/tenant.js';
import logger from '../../utils/logger.js';

// Entity types that can be synced
const SYNCABLE_ENTITIES = [
  'sale', 'sale_item', 'customer', 'product', 'inventory_batch',
  'invoice', 'payment', 'stock_movement',
] as const;

// Entities with additive-only sync (never overwrite)
const ADDITIVE_ONLY_ENTITIES = new Set(['sale', 'sale_item', 'payment', 'stock_movement', 'ledger_entry']);

// Entity → table name mapping
const ENTITY_TABLE_MAP: Record<string, string> = {
  sale: 'sales',
  sale_item: 'sale_items',
  customer: 'customers',
  product: 'products',
  inventory_batch: 'inventory_batches',
  invoice: 'invoices',
  payment: 'payments',
  stock_movement: 'stock_movements',
};

export const syncService = {
  /**
   * Process an incoming sync batch from an edge node.
   * Each item is processed independently — partial success is allowed.
   */
  async processSyncBatch(
    masterPool: pg.Pool,
    tenantPool: pg.Pool,
    tenantId: string,
    batch: SyncBatch
  ): Promise<SyncResult> {
    const results: SyncItemResult[] = [];
    let succeeded = 0;
    let conflicts = 0;
    let failed = 0;

    for (const item of batch.items) {
      try {
        const result = await this.processSyncItem(tenantPool, tenantId, batch.edgeNodeId, item);
        results.push(result);

        if (result.status === 'SYNCED') succeeded++;
        else if (result.status === 'CONFLICT') conflicts++;
        else failed++;

        // Record in sync ledger (master DB)
        await this.recordSyncLedgerEntry(masterPool, tenantId, batch.edgeNodeId, item, result);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Sync item failed: ${item.entityType}/${item.entityId}`, { error: errorMsg });
        results.push({
          entityType: item.entityType,
          entityId: item.entityId,
          status: 'FAILED',
          error: errorMsg,
        });
        failed++;
      }
    }

    // Update tenant sync status
    await masterPool.query(
      `UPDATE tenants SET last_sync_at = NOW(), sync_status = 'IDLE' WHERE id = $1`,
      [tenantId]
    );

    return {
      batchId: batch.batchId,
      processed: batch.items.length,
      succeeded,
      conflicts,
      failed,
      items: results,
    };
  },

  /**
   * Process a single sync item
   */
  async processSyncItem(
    tenantPool: pg.Pool,
    tenantId: string,
    edgeNodeId: string,
    item: SyncItem
  ): Promise<SyncItemResult> {
    const tableName = ENTITY_TABLE_MAP[item.entityType];
    if (!tableName) {
      return {
        entityType: item.entityType,
        entityId: item.entityId,
        status: 'FAILED',
        error: `Unknown entity type: ${item.entityType}`,
      };
    }

    // Check version conflict
    const currentVersion = await this.getEntityVersion(tenantPool, item.entityType, item.entityId);

    if (currentVersion !== null && currentVersion >= item.version) {
      // Version conflict — server has same or newer version

      if (ADDITIVE_ONLY_ENTITIES.has(item.entityType)) {
        // For additive entities, if the record already exists with same/higher version, skip
        return {
          entityType: item.entityType,
          entityId: item.entityId,
          status: 'SYNCED', // Already exists, not a conflict
          serverVersion: currentVersion,
        };
      }

      // For updatable entities, detect real conflict
      return {
        entityType: item.entityType,
        entityId: item.entityId,
        status: 'CONFLICT',
        serverVersion: currentVersion,
        error: `Server version ${currentVersion} >= edge version ${item.version}`,
      };
    }

    // Apply the change
    if (item.action === 'CREATE') {
      await this.upsertEntity(tenantPool, tableName, item);
    } else if (item.action === 'UPDATE') {
      if (ADDITIVE_ONLY_ENTITIES.has(item.entityType)) {
        // Cannot update additive-only entities
        return {
          entityType: item.entityType,
          entityId: item.entityId,
          status: 'FAILED',
          error: `${item.entityType} is additive-only and cannot be updated via sync`,
        };
      }
      await this.updateEntity(tenantPool, tableName, item);
    } else if (item.action === 'DELETE') {
      if (ADDITIVE_ONLY_ENTITIES.has(item.entityType)) {
        return {
          entityType: item.entityType,
          entityId: item.entityId,
          status: 'FAILED',
          error: `${item.entityType} is additive-only and cannot be deleted via sync`,
        };
      }
      await this.deleteEntity(tenantPool, tableName, item.entityId);
    }

    // Update version tracker
    await this.updateEntityVersion(tenantPool, item.entityType, item.entityId, item.version);

    return {
      entityType: item.entityType,
      entityId: item.entityId,
      status: 'SYNCED',
      serverVersion: item.version,
    };
  },

  /**
   * Get changes since a given timestamp for download to edge nodes
   */
  async getChangesSince(
    tenantPool: pg.Pool,
    since: string,
    entityTypes?: string[],
    limit: number = 500
  ): Promise<{ items: SyncItem[]; hasMore: boolean }> {
    const types = entityTypes || Object.keys(ENTITY_TABLE_MAP);
    const allItems: SyncItem[] = [];

    for (const entityType of types) {
      const tableName = ENTITY_TABLE_MAP[entityType];
      if (!tableName) continue;

      // Get entities modified since the given timestamp
      const result = await tenantPool.query(
        `SELECT sm.entity_id, sm.version, sm.last_modified_at
         FROM sync_metadata sm
         WHERE sm.entity_type = $1 AND sm.last_modified_at > $2
         ORDER BY sm.last_modified_at ASC
         LIMIT $3`,
        [entityType, since, limit]
      );

      for (const row of result.rows) {
        // Fetch the actual entity data
        const entityResult = await tenantPool.query(
          `SELECT * FROM ${tableName} WHERE id = $1`,
          [row.entity_id]
        );

        if (entityResult.rows.length > 0) {
          allItems.push({
            entityType,
            entityId: row.entity_id,
            action: 'UPDATE', // Downloads are always upserts
            data: entityResult.rows[0],
            version: parseInt(row.version, 10),
            localTimestamp: row.last_modified_at,
          });
        }
      }
    }

    // Sort by timestamp and apply global limit
    allItems.sort((a, b) => a.localTimestamp.localeCompare(b.localTimestamp));
    const limited = allItems.slice(0, limit);

    return {
      items: limited,
      hasMore: allItems.length > limit,
    };
  },

  /**
   * Get sync status for a tenant
   */
  async getSyncStatus(
    masterPool: pg.Pool,
    tenantId: string
  ): Promise<{
    pendingUp: number;
    pendingDown: number;
    conflicts: number;
    lastSyncAt: string | null;
    syncStatus: string;
  }> {
    const [pendingUp, pendingDown, conflictCount, tenant] = await Promise.all([
      masterPool.query(
        `SELECT COUNT(*)::int as count FROM sync_ledger 
         WHERE tenant_id = $1 AND direction = 'UP' AND status = 'PENDING'`,
        [tenantId]
      ),
      masterPool.query(
        `SELECT COUNT(*)::int as count FROM sync_ledger 
         WHERE tenant_id = $1 AND direction = 'DOWN' AND status = 'PENDING'`,
        [tenantId]
      ),
      masterPool.query(
        `SELECT COUNT(*)::int as count FROM sync_ledger 
         WHERE tenant_id = $1 AND status = 'CONFLICT'`,
        [tenantId]
      ),
      masterPool.query(
        `SELECT last_sync_at, sync_status FROM tenants WHERE id = $1`,
        [tenantId]
      ),
    ]);

    return {
      pendingUp: pendingUp.rows[0]?.count || 0,
      pendingDown: pendingDown.rows[0]?.count || 0,
      conflicts: conflictCount.rows[0]?.count || 0,
      lastSyncAt: tenant.rows[0]?.last_sync_at || null,
      syncStatus: tenant.rows[0]?.sync_status || 'IDLE',
    };
  },

  /**
   * Get unresolved conflicts for a tenant
   */
  async getConflicts(
    masterPool: pg.Pool,
    tenantId: string,
    limit: number = 50
  ): Promise<SyncConflict[]> {
    const result = await masterPool.query(
      `SELECT entity_type, entity_id, payload, conflict_data, created_at
       FROM sync_ledger
       WHERE tenant_id = $1 AND status = 'CONFLICT'
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      localData: (row.payload as Record<string, unknown>) || {},
      serverData: ((row.conflict_data as Record<string, unknown>) || {}),
      localTimestamp: '',
      serverTimestamp: row.created_at as string,
    }));
  },

  /**
   * Resolve a sync conflict
   */
  async resolveConflict(
    masterPool: pg.Pool,
    tenantPool: pg.Pool,
    tenantId: string,
    entityType: string,
    entityId: string,
    resolution: 'LOCAL_WINS' | 'SERVER_WINS'
  ): Promise<void> {
    if (resolution === 'LOCAL_WINS') {
      // Apply the local (edge) data to the server
      const ledgerEntry = await masterPool.query(
        `SELECT payload FROM sync_ledger 
         WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3 AND status = 'CONFLICT'
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, entityType, entityId]
      );

      if (ledgerEntry.rows.length > 0 && ledgerEntry.rows[0].payload) {
        const tableName = ENTITY_TABLE_MAP[entityType];
        if (tableName) {
          const data = ledgerEntry.rows[0].payload;
          await this.upsertEntity(tenantPool, tableName, {
            entityType,
            entityId,
            action: 'UPDATE',
            data,
            version: 999999, // Force high version
            localTimestamp: new Date().toISOString(),
          });
        }
      }
    }
    // SERVER_WINS: just mark as resolved, server data stays

    await masterPool.query(
      `UPDATE sync_ledger SET status = 'SYNCED', synced_at = NOW()
       WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3 AND status = 'CONFLICT'`,
      [tenantId, entityType, entityId]
    );
  },

  // ============================================================
  // Internal Helpers
  // ============================================================

  async getEntityVersion(pool: pg.Pool, entityType: string, entityId: string): Promise<number | null> {
    const result = await pool.query(
      `SELECT version FROM sync_metadata WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId]
    );
    return result.rows.length > 0 ? parseInt(result.rows[0].version, 10) : null;
  },

  async updateEntityVersion(pool: pg.Pool, entityType: string, entityId: string, version: number): Promise<void> {
    await pool.query(
      `INSERT INTO sync_metadata (entity_type, entity_id, version, last_modified_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (entity_type, entity_id)
       DO UPDATE SET version = GREATEST(sync_metadata.version, $3), last_modified_at = NOW()`,
      [entityType, entityId, version]
    );
  },

  async upsertEntity(pool: pg.Pool, tableName: string, item: SyncItem): Promise<void> {
    const data = item.data as Record<string, unknown>;
    const columns = Object.keys(data);
    const values = Object.values(data);

    if (columns.length === 0) return;

    // Ensure 'id' is present
    if (!columns.includes('id')) {
      columns.unshift('id');
      values.unshift(item.entityId);
    }

    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const updateClauses = columns
      .filter(c => c !== 'id')
      .map((col, i) => `${col} = EXCLUDED.${col}`)
      .join(', ');

    const safeTable = tableName.replace(/[^a-z0-9_]/gi, '');

    await pool.query(
      `INSERT INTO ${safeTable} (${columns.join(', ')}) VALUES (${placeholders})
       ON CONFLICT (id) DO UPDATE SET ${updateClauses}`,
      values
    );
  },

  async updateEntity(pool: pg.Pool, tableName: string, item: SyncItem): Promise<void> {
    const data = item.data as Record<string, unknown>;
    const columns = Object.keys(data).filter(c => c !== 'id');
    const values = Object.values(data).filter((_, i) => Object.keys(data)[i] !== 'id');

    if (columns.length === 0) return;

    const setClauses = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
    const safeTable = tableName.replace(/[^a-z0-9_]/gi, '');

    await pool.query(
      `UPDATE ${safeTable} SET ${setClauses} WHERE id = $${columns.length + 1}`,
      [...values, item.entityId]
    );
  },

  async deleteEntity(pool: pg.Pool, tableName: string, entityId: string): Promise<void> {
    const safeTable = tableName.replace(/[^a-z0-9_]/gi, '');
    await pool.query(`DELETE FROM ${safeTable} WHERE id = $1`, [entityId]);
  },

  async recordSyncLedgerEntry(
    masterPool: pg.Pool,
    tenantId: string,
    edgeNodeId: string,
    item: SyncItem,
    result: SyncItemResult
  ): Promise<void> {
    await masterPool.query(
      `INSERT INTO sync_ledger (tenant_id, edge_node_id, entity_type, entity_id, direction, sync_version, status, payload, synced_at)
       VALUES ($1, $2, $3, $4, 'UP', $5, $6, $7, CASE WHEN $6 = 'SYNCED' THEN NOW() ELSE NULL END)`,
      [
        tenantId, edgeNodeId, item.entityType, item.entityId,
        item.version, result.status, JSON.stringify(item.data),
      ]
    );
  },
};
