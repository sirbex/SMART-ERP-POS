/**
 * Phase F — supplier reassignment data access
 */

import type { Pool, PoolClient } from 'pg';

export const supplierReassignmentRepository = {

    async getGrTotalValue(pool: Pool | PoolClient, grnId: string): Promise<number> {
        const result = await pool.query(
            `SELECT COALESCE(SUM(gri.received_quantity::numeric * gri.cost_price::numeric), 0)::numeric AS total
             FROM goods_receipt_items gri
             WHERE gri.goods_receipt_id = $1`,
            [grnId],
        );
        return Number(result.rows[0]?.total ?? 0);
    },

    /**
     * Net GR/IR clearing (2150) credit balance for this GRN under the from-supplier entity tag.
     */
    async getOpenGrirForGrn(
        pool: Pool | PoolClient,
        grnId: string,
        supplierId: string,
    ): Promise<number> {
        const result = await pool.query(
            `SELECT COALESCE(SUM(le."CreditAmount"::numeric - le."DebitAmount"::numeric), 0)::numeric AS net
             FROM ledger_entries le
             JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
             JOIN accounts a ON a."Id" = le."AccountId"
             WHERE a."AccountCode" = '2150'
               AND UPPER(COALESCE(le."EntityType", '')) = 'SUPPLIER'
               AND le."EntityId"::text = $1::text
               AND lt."ReferenceType" = 'GOODS_RECEIPT'
               AND lt."ReferenceId" = $2::uuid
               AND COALESCE(lt."IsReversed", false) = false
               AND lt."Status" = 'POSTED'`,
            [supplierId, grnId],
        );
        return Math.max(0, Number(result.rows[0]?.net ?? 0));
    },

    async insertEvent(
        client: PoolClient,
        data: {
            grnId: string;
            fromSupplierId: string;
            toSupplierId: string;
            amount: number;
            accountScope: 'GRIR' | 'AP';
            glTransactionId: string;
            reason: string;
            createdBy: string;
        },
    ): Promise<string> {
        const result = await client.query(
            `INSERT INTO supplier_reassignment_events (
                grn_id, from_supplier_id, to_supplier_id, amount,
                account_scope, gl_transaction_id, reason, created_by
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
                data.grnId,
                data.fromSupplierId,
                data.toSupplierId,
                data.amount,
                data.accountScope,
                data.glTransactionId,
                data.reason,
                data.createdBy,
            ],
        );
        return result.rows[0].id as string;
    },

    /** Align PO vendor with corrected GR (SAP: PO header follows vendor correction). */
    async updatePurchaseOrderSupplier(
        client: PoolClient,
        purchaseOrderId: string,
        supplierId: string,
    ): Promise<boolean> {
        const result = await client.query(
            `UPDATE purchase_orders
             SET supplier_id = $2,
                 version = version + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id`,
            [purchaseOrderId, supplierId],
        );
        return (result.rowCount ?? 0) > 0;
    },
};
