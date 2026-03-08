// Inventory Ledger Repository — queries against inventory_ledger, valuation_layers, vw_stock_reconciliation views
// All stock truth is derived from stock_movements via signed-quantity aggregation

import type { Pool } from 'pg';
import logger from '../../utils/logger.js';

// ── Types ────────────────────────────────────────────────────

export interface LedgerEntry {
    id: string;
    movementNumber: string;
    productId: string;
    batchId: string | null;
    movementType: string;
    absQuantity: number;
    signedQuantity: number;
    unitCost: number;
    signedValue: number;
    referenceType: string | null;
    referenceId: string | null;
    notes: string | null;
    createdById: string | null;
    movementDate: string;
}

export interface ValuationLayer {
    id: string;
    productId: string;
    productName: string;
    sku: string | null;
    batchNumber: string | null;
    originalQuantity: number;
    remainingQuantity: number;
    consumedQuantity: number;
    unitCost: number;
    remainingValue: number;
    originalValue: number;
    consumedValue: number;
    receivedDate: string;
    isActive: boolean;
    layerStatus: 'DEPLETED' | 'PARTIAL' | 'FULL';
    costingMethod: string;
}

export interface ReconciliationRow {
    productId: string;
    productName: string;
    sku: string | null;
    ledgerStock: number;
    batchStock: number;
    cachedStock: number;
    ledgerVsBatchDiff: number;
    batchVsCacheDiff: number;
    ledgerVsCacheDiff: number;
    isReconciled: boolean;
    totalMovements: number;
    lastMovementDate: string | null;
}

// ── Helpers ──────────────────────────────────────────────────

function mapLedgerRow(r: Record<string, unknown>): LedgerEntry {
    return {
        id: r.id as string,
        movementNumber: r.movement_number as string,
        productId: r.product_id as string,
        batchId: r.batch_id as string | null,
        movementType: r.movement_type as string,
        absQuantity: parseFloat(String(r.abs_quantity)),
        signedQuantity: parseFloat(String(r.signed_quantity)),
        unitCost: parseFloat(String(r.unit_cost ?? 0)),
        signedValue: parseFloat(String(r.signed_value)),
        referenceType: r.reference_type as string | null,
        referenceId: r.reference_id as string | null,
        notes: r.notes as string | null,
        createdById: r.created_by_id as string | null,
        movementDate: String(r.movement_date),
    };
}

function mapValuationRow(r: Record<string, unknown>): ValuationLayer {
    return {
        id: r.id as string,
        productId: r.product_id as string,
        productName: r.product_name as string,
        sku: r.sku as string | null,
        batchNumber: r.batch_number as string | null,
        originalQuantity: parseFloat(String(r.original_quantity)),
        remainingQuantity: parseFloat(String(r.remaining_quantity)),
        consumedQuantity: parseFloat(String(r.consumed_quantity)),
        unitCost: parseFloat(String(r.unit_cost)),
        remainingValue: parseFloat(String(r.remaining_value)),
        originalValue: parseFloat(String(r.original_value)),
        consumedValue: parseFloat(String(r.consumed_value)),
        receivedDate: String(r.received_date),
        isActive: r.is_active as boolean,
        layerStatus: r.layer_status as 'DEPLETED' | 'PARTIAL' | 'FULL',
        costingMethod: r.costing_method as string,
    };
}

function mapReconciliationRow(r: Record<string, unknown>): ReconciliationRow {
    return {
        productId: r.product_id as string,
        productName: r.product_name as string,
        sku: r.sku as string | null,
        ledgerStock: parseFloat(String(r.ledger_stock)),
        batchStock: parseFloat(String(r.batch_stock)),
        cachedStock: parseFloat(String(r.cached_stock)),
        ledgerVsBatchDiff: parseFloat(String(r.ledger_vs_batch_diff)),
        batchVsCacheDiff: parseFloat(String(r.batch_vs_cache_diff)),
        ledgerVsCacheDiff: parseFloat(String(r.ledger_vs_cache_diff)),
        isReconciled: r.is_reconciled as boolean,
        totalMovements: parseInt(String(r.total_movements), 10),
        lastMovementDate: r.last_movement_date ? String(r.last_movement_date) : null,
    };
}

// ── Repository ───────────────────────────────────────────────

export const inventoryLedgerRepository = {

    /**
     * Get inventory ledger entries for a product (full audit trail)
     */
    async getProductLedger(
        pool: Pool,
        productId: string,
        options?: { limit?: number; offset?: number }
    ): Promise<{ entries: LedgerEntry[]; total: number }> {
        const limit = options?.limit ?? 100;
        const offset = options?.offset ?? 0;

        const [dataResult, countResult] = await Promise.all([
            pool.query(
                `SELECT * FROM inventory_ledger
         WHERE product_id = $1
         ORDER BY movement_date DESC
         LIMIT $2 OFFSET $3`,
                [productId, limit, offset]
            ),
            pool.query(
                `SELECT COUNT(*) AS cnt FROM inventory_ledger WHERE product_id = $1`,
                [productId]
            ),
        ]);

        return {
            entries: dataResult.rows.map(mapLedgerRow),
            total: parseInt(countResult.rows[0].cnt, 10),
        };
    },

    /**
     * Get ledger-derived stock balance for a product (truth value)
     */
    async getLedgerBalance(pool: Pool, productId: string): Promise<number> {
        const result = await pool.query(
            `SELECT fn_ledger_stock_balance($1) AS balance`,
            [productId]
        );
        return parseFloat(result.rows[0].balance);
    },

    /**
     * Get valuation layers for a product
     */
    async getProductValuationLayers(
        pool: Pool,
        productId: string,
        activeOnly = true
    ): Promise<ValuationLayer[]> {
        const whereClause = activeOnly
            ? `WHERE product_id = $1 AND remaining_quantity > 0`
            : `WHERE product_id = $1`;

        const result = await pool.query(
            `SELECT * FROM valuation_layers ${whereClause} ORDER BY received_date ASC`,
            [productId]
        );
        return result.rows.map(mapValuationRow);
    },

    /**
     * Get total inventory valuation across all products
     */
    async getTotalValuation(pool: Pool): Promise<{
        totalRemainingValue: number;
        totalOriginalValue: number;
        activeLayers: number;
        products: number;
    }> {
        const result = await pool.query(`
      SELECT
        COALESCE(SUM(remaining_value), 0) AS total_remaining,
        COALESCE(SUM(original_value), 0) AS total_original,
        COUNT(*) AS active_layers,
        COUNT(DISTINCT product_id) AS products
      FROM valuation_layers
      WHERE remaining_quantity > 0
    `);
        const r = result.rows[0];
        return {
            totalRemainingValue: parseFloat(r.total_remaining),
            totalOriginalValue: parseFloat(r.total_original),
            activeLayers: parseInt(r.active_layers, 10),
            products: parseInt(r.products, 10),
        };
    },

    /**
     * Three-way stock reconciliation (ledger vs batches vs cache)
     */
    async getReconciliation(pool: Pool): Promise<ReconciliationRow[]> {
        const result = await pool.query(
            `SELECT * FROM vw_stock_reconciliation ORDER BY is_reconciled ASC, total_movements DESC`
        );
        return result.rows.map(mapReconciliationRow);
    },

    /**
     * Get only products with discrepancies
     */
    async getDiscrepancies(pool: Pool): Promise<ReconciliationRow[]> {
        const result = await pool.query(
            `SELECT * FROM vw_stock_reconciliation WHERE is_reconciled = false ORDER BY ABS(ledger_vs_cache_diff) DESC`
        );
        return result.rows.map(mapReconciliationRow);
    },

    /**
     * Movement summary by type for a product (or all products)
     */
    async getMovementSummary(
        pool: Pool,
        productId?: string
    ): Promise<Array<{ movementType: string; count: number; totalQuantity: number; totalValue: number }>> {
        const params: unknown[] = [];
        let where = '';
        if (productId) {
            params.push(productId);
            where = 'WHERE product_id = $1';
        }

        const result = await pool.query(
            `SELECT
        movement_type,
        COUNT(*) AS movement_count,
        SUM(abs_quantity) AS total_quantity,
        SUM(ABS(signed_value)) AS total_value
       FROM inventory_ledger
       ${where}
       GROUP BY movement_type
       ORDER BY movement_count DESC`,
            params
        );

        return result.rows.map(r => ({
            movementType: r.movement_type as string,
            count: parseInt(r.movement_count, 10),
            totalQuantity: parseFloat(r.total_quantity),
            totalValue: parseFloat(r.total_value),
        }));
    },
};
