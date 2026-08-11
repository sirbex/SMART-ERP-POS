/**
 * Return GRN Repository
 * 
 * Data access layer for Return Goods Receipt Notes.
 * Pure SQL queries — no business logic.
 */

import type { Pool, PoolClient } from 'pg';
import { getBusinessYear } from '../../utils/dateRange.js';
import { isMultistoreEnabled } from '../inventory/warehouse/multistoreSettings.js';
import {
    supplierReturnDocumentEntitlementSql,
    supplierReturnOnHandQuantityExpr,
} from './returnGrnReturnableSql.js';

// ============================================================
// Types
// ============================================================

export interface ReturnGrn {
    id: string;
    returnGrnNumber: string;
    grnId: string;
    supplierId: string;
    supplierName: string;
    grNumber: string;
    returnDate: string;
    status: 'DRAFT' | 'POSTED';
    reason: string;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
    hasCreditNote?: boolean;
    /** True when a SUPPLIER_INVOICE exists for this return's parent GRN (required before SCN). */
    hasSupplierBill?: boolean;
    /** Sum of return line totals (purchase UOM × cost). */
    totalAmount?: number;
    creditNoteNumber?: string | null;
    creditNoteStatus?: string | null;
    supplierBillNumber?: string | null;
    /**
     * Worklist next step (SSOT for UI):
     * DRAFT | NEED_BILL | NEED_SCN | HAS_SCN | COMPLETE
     */
    actionStatus?: 'DRAFT' | 'NEED_BILL' | 'NEED_SCN' | 'HAS_SCN' | 'COMPLETE';
}

export interface ReturnGrnLine {
    id: string;
    rgrnId: string;
    productId: string;
    productName: string;
    batchId: string | null;
    batchNumber: string | null;
    uomId: string | null;
    uomName: string | null;
    uomSymbol: string | null;
    conversionFactor: number;
    quantity: number;
    baseQuantity: number;
    unitCost: number;
    lineTotal: number;
}

export interface CreateReturnGrnData {
    grnId: string;
    supplierId: string;
    returnDate: string;
    reason: string;
    createdBy: string;
}

export interface CreateReturnGrnLineData {
    rgrnId: string;
    productId: string;
    batchId: string | null;
    uomId: string | null;
    quantity: number;
    baseQuantity: number;
    unitCost: number;
    lineTotal: number;
}

// ============================================================
// Repository
// ============================================================

export const returnGrnRepository = {

    /**
     * Generate sequential RGRN number: RGRN-YYYY-NNNN
     */
    async generateNumber(pool: Pool | PoolClient): Promise<string> {
        await pool.query(`SELECT pg_advisory_xact_lock(hashtext('rgrn_number_seq'))`);
        const year = getBusinessYear();
        const result = await pool.query(
            `SELECT return_grn_number FROM return_grn
       WHERE return_grn_number LIKE $1
       ORDER BY return_grn_number DESC LIMIT 1`,
            [`RGRN-${year}-%`]
        );
        if (result.rows.length === 0) return `RGRN-${year}-0001`;
        const last = result.rows[0].return_grn_number as string;
        const seq = parseInt(last.split('-')[2]) + 1;
        return `RGRN-${year}-${seq.toString().padStart(4, '0')}`;
    },

    /**
     * Create a Return GRN header (DRAFT).
     */
    async create(pool: Pool | PoolClient, data: CreateReturnGrnData): Promise<ReturnGrn> {
        const number = await returnGrnRepository.generateNumber(pool);
        const result = await pool.query(
            `INSERT INTO return_grn (return_grn_number, grn_id, supplier_id, return_date, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id,
         return_grn_number AS "returnGrnNumber",
         grn_id            AS "grnId",
         supplier_id       AS "supplierId",
         return_date        AS "returnDate",
         status,
         reason,
         created_by         AS "createdBy",
         created_at         AS "createdAt",
         updated_at         AS "updatedAt"`,
            [number, data.grnId, data.supplierId, data.returnDate, data.reason, data.createdBy]
        );
        return { ...result.rows[0], supplierName: '', grNumber: '' };
    },

    /**
     * Create a Return GRN line item.
     */
    async createLine(pool: Pool | PoolClient, data: CreateReturnGrnLineData): Promise<ReturnGrnLine> {
        const result = await pool.query(
            `INSERT INTO return_grn_lines (rgrn_id, product_id, batch_id, uom_id, quantity, base_quantity, unit_cost, line_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING
         id,
         rgrn_id       AS "rgrnId",
         product_id    AS "productId",
         batch_id      AS "batchId",
         uom_id        AS "uomId",
         quantity,
         base_quantity AS "baseQuantity",
         unit_cost     AS "unitCost",
         line_total    AS "lineTotal"`,
            [data.rgrnId, data.productId, data.batchId, data.uomId, data.quantity, data.baseQuantity, data.unitCost, data.lineTotal]
        );
        return { ...result.rows[0], productName: '', batchNumber: null, uomName: null, uomSymbol: null, conversionFactor: 1 };
    },

    /**
     * Post a Return GRN (DRAFT → POSTED). Returns null if not found or not DRAFT.
     */
    async post(pool: Pool | PoolClient, id: string): Promise<ReturnGrn | null> {
        const result = await pool.query(
            `UPDATE return_grn
       SET status = 'POSTED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'DRAFT'
       RETURNING
         id,
         return_grn_number AS "returnGrnNumber",
         grn_id            AS "grnId",
         supplier_id       AS "supplierId",
         return_date        AS "returnDate",
         status,
         reason,
         created_by         AS "createdBy",
         created_at         AS "createdAt",
         updated_at         AS "updatedAt"`,
            [id]
        );
        return result.rows[0] || null;
    },

    /**
     * Get a Return GRN by ID with supplier/GR details.
     */
    async getById(pool: Pool | PoolClient, id: string): Promise<ReturnGrn | null> {
        const result = await pool.query(
            `SELECT
         r.id,
         r.return_grn_number  AS "returnGrnNumber",
         r.grn_id             AS "grnId",
         r.supplier_id        AS "supplierId",
         s."CompanyName"      AS "supplierName",
         g.receipt_number     AS "grNumber",
         r.return_date         AS "returnDate",
         r.status,
         r.reason,
         r.created_by          AS "createdBy",
         r.created_at          AS "createdAt",
         r.updated_at          AS "updatedAt"
       FROM return_grn r
       JOIN suppliers s ON s."Id" = r.supplier_id
       JOIN goods_receipts g ON g.id = r.grn_id
       WHERE r.id = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    /**
     * Get line items for a Return GRN with product/batch details.
     */
    async getLines(pool: Pool | PoolClient, rgrnId: string): Promise<ReturnGrnLine[]> {
        const result = await pool.query(
            `SELECT
         l.id,
         l.rgrn_id          AS "rgrnId",
         l.product_id       AS "productId",
         p.name             AS "productName",
         l.batch_id         AS "batchId",
         b.batch_number     AS "batchNumber",
         l.uom_id           AS "uomId",
         u.name             AS "uomName",
         u.symbol           AS "uomSymbol",
         COALESCE(pu.conversion_factor, 1) AS "conversionFactor",
         l.quantity,
         l.base_quantity    AS "baseQuantity",
         l.unit_cost        AS "unitCost",
         l.line_total       AS "lineTotal"
       FROM return_grn_lines l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN inventory_batches b ON b.id = l.batch_id
       LEFT JOIN uoms u ON u.id = l.uom_id
       LEFT JOIN product_uoms pu ON pu.product_id = l.product_id AND pu.uom_id = l.uom_id
       WHERE l.rgrn_id = $1
       ORDER BY l.created_at`,
            [rgrnId]
        );
        return result.rows;
    },

    /**
     * List Return GRNs with pagination + worklist fields (all suppliers).
     * SSOT for "what needs attention": POSTED returns without an active SCN.
     */
    async list(
        pool: Pool,
        options: {
            grnId?: string;
            supplierId?: string;
            status?: string;
            search?: string;
            needsAttention?: boolean;
            page: number;
            limit: number;
        },
    ): Promise<{ rows: ReturnGrn[]; total: number }> {
        const conditions: string[] = ['1=1'];
        const params: (string | number | boolean)[] = [];
        let idx = 1;

        if (options.grnId) {
            conditions.push(`r.grn_id = $${idx++}`);
            params.push(options.grnId);
        }
        if (options.supplierId) {
            conditions.push(`r.supplier_id = $${idx++}`);
            params.push(options.supplierId);
        }
        if (options.status) {
            conditions.push(`r.status = $${idx++}`);
            params.push(options.status);
        }
        if (options.search?.trim()) {
            conditions.push(
                `(r.return_grn_number ILIKE $${idx}
                  OR g.receipt_number ILIKE $${idx}
                  OR s."CompanyName" ILIKE $${idx}
                  OR COALESCE(s."SupplierCode", '') ILIKE $${idx}
                  OR COALESCE(r.reason, '') ILIKE $${idx})`,
            );
            params.push(`%${options.search.trim()}%`);
            idx++;
        }

        const hasActiveScnSql = `EXISTS (
           SELECT 1 FROM supplier_invoices si
           WHERE si.return_grn_id = r.id
             AND si.document_type = 'SUPPLIER_CREDIT_NOTE'
             AND si.deleted_at IS NULL
             AND UPPER(COALESCE(si."Status",'')) NOT IN ('CANCELLED', 'VOID', 'VOIDED', 'DELETED')
         )`;

        // Cancelled/void filters use UPPER(COALESCE(...)) so list ≡ getByGrnId ≡ SCN bill gate.
        const hasSupplierBillSql = `EXISTS (
           SELECT 1
           FROM supplier_invoices si
           WHERE si.document_type = 'SUPPLIER_INVOICE'
             AND si.deleted_at IS NULL
             AND UPPER(COALESCE(si."Status",'')) NOT IN ('CANCELLED', 'VOID', 'VOIDED', 'DELETED')
             AND (
               si."Id" IN (
                 SELECT sigl.invoice_id FROM supplier_invoice_grn_links sigl
                 WHERE sigl.grn_id = r.grn_id
               )
               OR si."InternalReferenceNumber" = g.receipt_number
               OR si."PurchaseOrderId" = g.purchase_order_id
             )
         )`;

        if (options.needsAttention) {
            // POSTED stock return still waiting for Supplier Credit Note
            conditions.push(`r.status = 'POSTED'`);
            conditions.push(`NOT (${hasActiveScnSql})`);
        }

        const where = conditions.join(' AND ');

        const countRes = await pool.query(
            `SELECT COUNT(*)::int AS count
             FROM return_grn r
             JOIN suppliers s ON s."Id" = r.supplier_id
             JOIN goods_receipts g ON g.id = r.grn_id
             WHERE ${where}`,
            params,
        );
        const total = Number(countRes.rows[0].count) || 0;

        const offset = (options.page - 1) * options.limit;
        const dataRes = await pool.query(
            `SELECT
         r.id,
         r.return_grn_number  AS "returnGrnNumber",
         r.grn_id             AS "grnId",
         r.supplier_id        AS "supplierId",
         s."CompanyName"      AS "supplierName",
         g.receipt_number     AS "grNumber",
         r.return_date         AS "returnDate",
         r.status,
         r.reason,
         r.created_by          AS "createdBy",
         r.created_at          AS "createdAt",
         r.updated_at          AS "updatedAt",
         COALESCE(lines.total, 0)::float8 AS "totalAmount",
         (${hasActiveScnSql}) AS "hasCreditNote",
         (${hasSupplierBillSql}) AS "hasSupplierBill",
         scn."SupplierInvoiceNumber" AS "creditNoteNumber",
         scn."Status"::text AS "creditNoteStatus",
         bill."SupplierInvoiceNumber" AS "supplierBillNumber",
         CASE
           WHEN r.status = 'DRAFT' THEN 'DRAFT'
           WHEN NOT (${hasActiveScnSql}) AND NOT (${hasSupplierBillSql}) THEN 'NEED_BILL'
           WHEN NOT (${hasActiveScnSql}) THEN 'NEED_SCN'
           WHEN UPPER(COALESCE(scn."Status",'')) IN ('POSTED', 'OPEN', 'DRAFT') THEN 'HAS_SCN'
           ELSE 'COMPLETE'
         END AS "actionStatus"
       FROM return_grn r
       JOIN suppliers s ON s."Id" = r.supplier_id
       JOIN goods_receipts g ON g.id = r.grn_id
       LEFT JOIN (
         SELECT rgrn_id, SUM(line_total) AS total
         FROM return_grn_lines
         GROUP BY rgrn_id
       ) lines ON lines.rgrn_id = r.id
       LEFT JOIN LATERAL (
         SELECT si."SupplierInvoiceNumber", si."Status"
         FROM supplier_invoices si
         WHERE si.return_grn_id = r.id
           AND si.document_type = 'SUPPLIER_CREDIT_NOTE'
           AND si.deleted_at IS NULL
           AND UPPER(COALESCE(si."Status",'')) NOT IN ('CANCELLED', 'VOID', 'VOIDED', 'DELETED')
         ORDER BY si."CreatedAt" DESC
         LIMIT 1
       ) scn ON TRUE
       LEFT JOIN LATERAL (
         SELECT si."SupplierInvoiceNumber"
         FROM supplier_invoices si
         WHERE si.document_type = 'SUPPLIER_INVOICE'
           AND si.deleted_at IS NULL
           AND UPPER(COALESCE(si."Status",'')) NOT IN ('CANCELLED', 'VOID', 'VOIDED', 'DELETED')
           AND (
             si."Id" IN (
               SELECT sigl.invoice_id FROM supplier_invoice_grn_links sigl
               WHERE sigl.grn_id = r.grn_id
             )
             OR si."InternalReferenceNumber" = g.receipt_number
             OR si."PurchaseOrderId" = g.purchase_order_id
           )
         ORDER BY si."CreatedAt" DESC
         LIMIT 1
       ) bill ON TRUE
       WHERE ${where}
       ORDER BY
         CASE
           WHEN r.status = 'POSTED' AND NOT (${hasActiveScnSql}) THEN 0
           WHEN r.status = 'DRAFT' THEN 1
           ELSE 2
         END,
         r.return_date DESC NULLS LAST,
         r.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
            [...params, options.limit, offset],
        );

        return { rows: dataRes.rows, total };
    },

    /**
     * Get previously returned base quantity for a product+batch from a specific GRN.
     * Only counts POSTED returns.
     */
    async getReturnedQuantity(
        pool: Pool | PoolClient,
        grnId: string,
        productId: string,
        batchId: string | null,
    ): Promise<number> {
        const result = await pool.query(
            `SELECT COALESCE(SUM(l.base_quantity), 0) AS returned
       FROM return_grn_lines l
       JOIN return_grn r ON r.id = l.rgrn_id
       WHERE r.grn_id = $1
         AND l.product_id = $2
         AND r.status = 'POSTED'
         ${batchId ? 'AND l.batch_id = $3' : ''}`,
            batchId ? [grnId, productId, batchId] : [grnId, productId]
        );
        return Number(result.rows[0].returned) || 0;
    },

    /**
     * Get returnable items from a finalized GRN.
     * For each GR item, includes received quantity and already-returned quantity.
     */
    async getReturnableItems(pool: Pool | PoolClient, grnId: string): Promise<Array<{
        grItemId: string;
        productId: string;
        productName: string;
        batchId: string | null;
        batchNumber: string | null;
        expiryDate: string | null;
        uomId: string | null;
        uomName: string | null;
        uomSymbol: string | null;
        conversionFactor: number;
        baseUomId: string | null;
        baseUomSymbol: string | null;
        availableUoms: unknown;
        receivedQuantity: number;
        unitCost: number;
        returnedQuantity: number;
        /** Received (or batch qty) minus prior posted returns — document entitlement */
        documentReturnableQuantity: number;
        /** Physical stock available for return (batch; multistore caps by warehouse balances) */
        onHandQuantity: number;
        /** Sold, consumed, or otherwise not on hand (document − returnable) */
        consumedQuantity: number;
        /** min(documentReturnable, onHand) — quantity that may be returned now */
        returnableQuantity: number;
        returnBlockReason: string | null;
    }>> {
        // Join batches via goods_receipt_id+product_id (batch_number on GR items is often NULL
        // because batches are auto-generated during finalization, not written back to GR items).
        // When goods_receipt_item_id is set, prefer that for an exact 1:1 match.
        const multistore = await isMultistoreEnabled(pool);
        const onHandSql = supplierReturnOnHandQuantityExpr(multistore);
        const docEntitlementSql = supplierReturnDocumentEntitlementSql();

        const result = await pool.query(
            `SELECT
         gri.id                    AS "grItemId",
         gri.product_id            AS "productId",
         p.name                    AS "productName",
         ib.id                     AS "batchId",
         ib.batch_number           AS "batchNumber",
         ib.expiry_date::text      AS "expiryDate",
         gri.uom_id               AS "uomId",
         COALESCE(u.name, def_u.name)   AS "uomName",
         COALESCE(u.symbol, def_u.symbol) AS "uomSymbol",
         COALESCE(pu.conversion_factor, def_pu.conversion_factor, 1)::numeric AS "conversionFactor",
         COALESCE(p.base_uom_id, def_pu.uom_id) AS "baseUomId",
         COALESCE(base_u.symbol, base_u.name, def_u.symbol, def_u.name) AS "baseUomSymbol",
         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'uomId', pu2.uom_id,
                 'uomName', u2.name,
                 'uomSymbol', COALESCE(u2.symbol, u2.name),
                 'conversionFactor', pu2.conversion_factor,
                 'isDefault', pu2.is_default
               ) ORDER BY pu2.is_default DESC, u2.name ASC
             )
             FROM product_uoms pu2
             JOIN uoms u2 ON u2.id = pu2.uom_id
             WHERE pu2.product_id = gri.product_id
           ),
           '[]'::json
         ) AS "availableUoms",
         CASE
           WHEN ib.id IS NOT NULL THEN COALESCE(ib.quantity, 0)::numeric
           ELSE gri.received_quantity::numeric
                * COALESCE(pu.conversion_factor, def_pu.conversion_factor, 1)::numeric
         END AS "receivedQuantity",
         ROUND(gri.cost_price::numeric, 2) AS "unitCost",
         COALESCE(returned.qty, 0) AS "returnedQuantity",
         GREATEST(0, (${docEntitlementSql})) AS "documentReturnableQuantity",
         ${onHandSql} AS "onHandQuantity",
         LEAST(
           GREATEST(0, (${docEntitlementSql})),
           ${onHandSql}
         ) AS "returnableQuantity",
         GREATEST(0,
           GREATEST(0, (${docEntitlementSql}))
           - LEAST(
             GREATEST(0, (${docEntitlementSql})),
             ${onHandSql}
           )
         ) AS "consumedQuantity",
         CASE
           WHEN (
             CASE
               WHEN ib.id IS NOT NULL THEN COALESCE(ib.quantity, 0)::numeric
               ELSE gri.received_quantity::numeric
                    * COALESCE(pu.conversion_factor, def_pu.conversion_factor, 1)::numeric
             END
           ) <= COALESCE(returned.qty, 0)
             THEN 'Already fully returned to supplier'
           WHEN ib.id IS NULL
             THEN 'No active receipt batch — stock is not available for a supplier return'
           WHEN ${onHandSql} <= 0
             AND GREATEST(0, (${docEntitlementSql})) > 0
             THEN 'Sold or consumed — only on-hand quantity can be returned to the supplier'
           ELSE NULL
         END AS "returnBlockReason"
       FROM goods_receipt_items gri
       JOIN products p ON p.id = gri.product_id
       LEFT JOIN inventory_batches ib
         ON ib.product_id = gri.product_id
         AND (
           (ib.goods_receipt_item_id IS NOT NULL AND ib.goods_receipt_item_id = gri.id)
           OR
           (ib.goods_receipt_item_id IS NULL AND ib.goods_receipt_id = gri.goods_receipt_id)
         )
         AND ib.status = 'ACTIVE'
       LEFT JOIN uoms u ON u.id = gri.uom_id
       LEFT JOIN product_uoms pu ON pu.product_id = gri.product_id AND pu.uom_id = gri.uom_id
       LEFT JOIN product_uoms def_pu ON def_pu.product_id = gri.product_id AND def_pu.is_default = true
       LEFT JOIN uoms def_u ON def_u.id = def_pu.uom_id
       LEFT JOIN uoms base_u ON base_u.id = p.base_uom_id
       LEFT JOIN LATERAL (
         SELECT SUM(rl.base_quantity) AS qty
         FROM return_grn_lines rl
         JOIN return_grn rg ON rg.id = rl.rgrn_id
         WHERE rg.grn_id = gri.goods_receipt_id
           AND rl.product_id = gri.product_id
           AND rg.status = 'POSTED'
           AND (ib.id IS NULL OR rl.batch_id = ib.id)
       ) returned ON true
       WHERE gri.goods_receipt_id = $1
       ORDER BY p.name`,
            [grnId]
        );
        return result.rows;
    },

    /**
     * Get Return GRNs linked to a specific GRN (for badge display).
     */
    async getByGrnId(pool: Pool | PoolClient, grnId: string): Promise<ReturnGrn[]> {
        const result = await pool.query(
            `SELECT
         r.id,
         r.return_grn_number  AS "returnGrnNumber",
         r.grn_id             AS "grnId",
         r.supplier_id        AS "supplierId",
         s."CompanyName"      AS "supplierName",
         g.receipt_number     AS "grNumber",
         r.return_date         AS "returnDate",
         r.status,
         r.reason,
         r.created_by          AS "createdBy",
         r.created_at          AS "createdAt",
         r.updated_at          AS "updatedAt",
         EXISTS (
           SELECT 1 FROM supplier_invoices si
           WHERE si.return_grn_id = r.id
             AND si.document_type = 'SUPPLIER_CREDIT_NOTE'
             AND si.deleted_at IS NULL
             AND UPPER(COALESCE(si."Status",'')) NOT IN ('CANCELLED', 'VOID', 'VOIDED', 'DELETED')
         ) AS "hasCreditNote",
         EXISTS (
           SELECT 1
           FROM supplier_invoices si
           WHERE si.document_type = 'SUPPLIER_INVOICE'
             AND si.deleted_at IS NULL
             AND UPPER(COALESCE(si."Status",'')) NOT IN ('CANCELLED', 'VOID', 'VOIDED', 'DELETED')
             AND (
               si."Id" IN (
                 SELECT sigl.invoice_id FROM supplier_invoice_grn_links sigl
                 WHERE sigl.grn_id = r.grn_id
               )
               OR si."InternalReferenceNumber" = g.receipt_number
               OR si."PurchaseOrderId" = g.purchase_order_id
             )
         ) AS "hasSupplierBill"
       FROM return_grn r
       JOIN suppliers s ON s."Id" = r.supplier_id
       JOIN goods_receipts g ON g.id = r.grn_id
       WHERE r.grn_id = $1
       ORDER BY r.created_at DESC`,
            [grnId]
        );
        return result.rows;
    },
};
