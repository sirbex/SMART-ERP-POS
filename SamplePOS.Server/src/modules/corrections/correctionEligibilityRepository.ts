/**
 * Phase D — SQL helpers for correction dependency checks.
 */

import type { Pool, PoolClient } from 'pg';

export interface GrnSupplierInvoiceRow {
    id: string;
    invoiceNumber: string;
    status: string;
    documentType: string | null;
    totalAmount: number;
    amountPaid: number;
    outstandingBalance: number;
    isPostedToGl: boolean;
}

export interface GrnConsumedBatchRow {
    batchId: string;
    batchNumber: string | null;
    productId: string;
    productName: string;
    receivedQty: number;
    remainingQty: number;
    consumedQty: number;
}

export interface GrnReturnGrnSummary {
    id: string;
    returnGrnNumber: string;
    status: string;
    hasCreditNote: boolean;
}

export const correctionEligibilityRepository = {

    async getGrnHeader(
        pool: Pool | PoolClient,
        grnId: string,
    ): Promise<{
        id: string;
        grNumber: string;
        status: string;
        supplierId: string | null;
        supplierName: string | null;
        purchaseOrderId: string | null;
    } | null> {
        const result = await pool.query(
            `SELECT gr.id,
                    gr.receipt_number AS "grNumber",
                    gr.status,
                    po.supplier_id AS "supplierId",
                    s."CompanyName" AS "supplierName",
                    gr.purchase_order_id AS "purchaseOrderId"
             FROM goods_receipts gr
             LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
             LEFT JOIN suppliers s ON s."Id" = po.supplier_id
             WHERE gr.id = $1`,
            [grnId],
        );
        return result.rows[0] ?? null;
    },

    async getSupplierInvoicesForGrn(
        pool: Pool | PoolClient,
        grnId: string,
    ): Promise<GrnSupplierInvoiceRow[]> {
        const result = await pool.query(
            `SELECT DISTINCT ON (si."Id")
                    si."Id" AS id,
                    COALESCE(si."SupplierInvoiceNumber", '') AS "invoiceNumber",
                    si."Status" AS status,
                    si.document_type AS "documentType",
                    COALESCE(si."TotalAmount", 0)::numeric AS "totalAmount",
                    COALESCE(si."AmountPaid", 0)::numeric AS "amountPaid",
                    COALESCE(si."OutstandingBalance",
                             si."TotalAmount" - COALESCE(si."AmountPaid", 0))::numeric AS "outstandingBalance",
                    COALESCE(si.is_posted_to_gl, false) AS "isPostedToGl"
             FROM supplier_invoices si
             WHERE si.deleted_at IS NULL
               AND UPPER(COALESCE(si."Status", '')) NOT IN ('CANCELLED', 'VOID', 'VOIDED', 'DELETED', 'CANCELLED')
               AND (
                 si."Id" IN (
                   SELECT sigl.invoice_id FROM supplier_invoice_grn_links sigl WHERE sigl.grn_id = $1::uuid
                 )
                 OR si."PurchaseOrderId" IN (
                   SELECT gr.purchase_order_id FROM goods_receipts gr
                   WHERE gr.id = $1::uuid AND gr.purchase_order_id IS NOT NULL
                 )
               )
             ORDER BY si."Id", si."CreatedAt" DESC`,
            [grnId],
        );
        return result.rows.map((r) => ({
            id: r.id as string,
            invoiceNumber: r.invoiceNumber as string,
            status: r.status as string,
            documentType: (r.documentType as string | null) ?? null,
            totalAmount: Number(r.totalAmount),
            amountPaid: Number(r.amountPaid),
            outstandingBalance: Number(r.outstandingBalance),
            isPostedToGl: Boolean(r.isPostedToGl),
        }));
    },

    async getConsumedBatchesForGrn(
        pool: Pool | PoolClient,
        grnId: string,
    ): Promise<GrnConsumedBatchRow[]> {
        const result = await pool.query(
            `SELECT ib.id AS "batchId",
                    ib.batch_number AS "batchNumber",
                    ib.product_id AS "productId",
                    p.name AS "productName",
                    ib.quantity::numeric AS "receivedQty",
                    ib.remaining_quantity::numeric AS "remainingQty",
                    GREATEST(0, ib.quantity::numeric - ib.remaining_quantity::numeric) AS "consumedQty"
             FROM inventory_batches ib
             JOIN products p ON p.id = ib.product_id
             WHERE ib.goods_receipt_id = $1::uuid
               AND ib.quantity::numeric > ib.remaining_quantity::numeric
             ORDER BY p.name, ib.batch_number`,
            [grnId],
        );
        return result.rows.map((r) => ({
            batchId: r.batchId as string,
            batchNumber: (r.batchNumber as string | null) ?? null,
            productId: r.productId as string,
            productName: r.productName as string,
            receivedQty: Number(r.receivedQty),
            remainingQty: Number(r.remainingQty),
            consumedQty: Number(r.consumedQty),
        }));
    },

    async getReturnGrnsForGrn(
        pool: Pool | PoolClient,
        grnId: string,
    ): Promise<GrnReturnGrnSummary[]> {
        const result = await pool.query(
            `SELECT r.id,
                    r.return_grn_number AS "returnGrnNumber",
                    r.status,
                    EXISTS (
                      SELECT 1 FROM supplier_invoices si
                      WHERE si.return_grn_id = r.id
                        AND si.document_type = 'SUPPLIER_CREDIT_NOTE'
                        AND si.deleted_at IS NULL
                        AND UPPER(COALESCE(si."Status", '')) NOT IN ('CANCELLED', 'VOID', 'VOIDED', 'DELETED')
                    ) AS "hasCreditNote"
             FROM return_grn r
             WHERE r.grn_id = $1::uuid
             ORDER BY r.created_at DESC`,
            [grnId],
        );
        return result.rows as GrnReturnGrnSummary[];
    },

    async getGrnReversalMetadata(
        pool: Pool | PoolClient,
        grnId: string,
    ): Promise<{
        reversedByReturnGrnId: string | null;
        reversedByReturnGrnNumber: string | null;
        reversalTimestamp: string | null;
        reversalReason: string | null;
    } | null> {
        const colCheck = await pool.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_name = 'goods_receipts' AND column_name = 'reversed_by_return_grn_id'
             LIMIT 1`,
        );
        if (colCheck.rows.length === 0) {
            return {
                reversedByReturnGrnId: null,
                reversedByReturnGrnNumber: null,
                reversalTimestamp: null,
                reversalReason: null,
            };
        }

        const result = await pool.query(
            `SELECT gr.reversed_by_return_grn_id AS "reversedByReturnGrnId",
                    r.return_grn_number AS "reversedByReturnGrnNumber",
                    gr.reversal_timestamp AS "reversalTimestamp",
                    gr.reversal_reason AS "reversalReason"
             FROM goods_receipts gr
             LEFT JOIN return_grn r ON r.id = gr.reversed_by_return_grn_id
             WHERE gr.id = $1`,
            [grnId],
        );
        return result.rows[0] ?? null;
    },

    async countSupplierPaymentAllocations(
        pool: Pool | PoolClient,
        invoiceId: string,
    ): Promise<number> {
        const result = await pool.query(
            `SELECT COUNT(*)::int AS cnt
             FROM supplier_payment_allocations spa
             WHERE spa."SupplierInvoiceId" = $1
               AND spa.deleted_at IS NULL`,
            [invoiceId],
        );
        return Number(result.rows[0]?.cnt ?? 0);
    },

    async getSupplierInvoiceHeader(
        pool: Pool | PoolClient,
        invoiceId: string,
    ): Promise<{
        id: string;
        invoiceNumber: string;
        status: string;
        goodsReceiptId: string | null;
        amountPaid: number;
        outstandingBalance: number;
        totalAmount: number;
    } | null> {
        const result = await pool.query(
            `SELECT si."Id" AS id,
                    COALESCE(si."SupplierInvoiceNumber", '') AS "invoiceNumber",
                    si."Status" AS status,
                    (SELECT sigl.grn_id FROM supplier_invoice_grn_links sigl
                      WHERE sigl.invoice_id = si."Id" LIMIT 1) AS "goodsReceiptId",
                    COALESCE(si."AmountPaid", 0)::numeric AS "amountPaid",
                    COALESCE(si."OutstandingBalance",
                             si."TotalAmount" - COALESCE(si."AmountPaid", 0))::numeric AS "outstandingBalance",
                    COALESCE(si."TotalAmount", 0)::numeric AS "totalAmount"
             FROM supplier_invoices si
             WHERE si."Id" = $1 AND si.deleted_at IS NULL`,
            [invoiceId],
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
            id: row.id as string,
            invoiceNumber: row.invoiceNumber as string,
            status: row.status as string,
            goodsReceiptId: (row.goodsReceiptId as string | null) ?? null,
            amountPaid: Number(row.amountPaid),
            outstandingBalance: Number(row.outstandingBalance),
            totalAmount: Number(row.totalAmount),
        };
    },

    async getCustomerInvoiceHeader(
        pool: Pool | PoolClient,
        invoiceId: string,
    ): Promise<{
        id: string;
        invoiceNumber: string;
        status: string;
        amountPaid: number;
        outstandingBalance: number;
        saleId: string | null;
        saleStatus: string | null;
    } | null> {
        const result = await pool.query(
            `SELECT i.id,
                    i.invoice_number AS "invoiceNumber",
                    i.status,
                    COALESCE(i.amount_paid, 0)::numeric AS "amountPaid",
                    COALESCE(i.outstanding_balance,
                             i.total_amount - COALESCE(i.amount_paid, 0))::numeric AS "outstandingBalance",
                    i.sale_id AS "saleId",
                    s.status AS "saleStatus"
             FROM invoices i
             LEFT JOIN sales s ON s.id = i.sale_id
             WHERE i.id = $1`,
            [invoiceId],
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
            id: row.id as string,
            invoiceNumber: row.invoiceNumber as string,
            status: row.status as string,
            amountPaid: Number(row.amountPaid),
            outstandingBalance: Number(row.outstandingBalance),
            saleId: (row.saleId as string | null) ?? null,
            saleStatus: (row.saleStatus as string | null) ?? null,
        };
    },

    async countActiveArAllocations(
        pool: Pool | PoolClient,
        paymentId: string,
    ): Promise<number> {
        const result = await pool.query(
            `SELECT COUNT(*)::int AS cnt
             FROM ar_payment_allocations
             WHERE payment_id = $1 AND status = 'ACTIVE'`,
            [paymentId],
        );
        return Number(result.rows[0]?.cnt ?? 0);
    },
};
