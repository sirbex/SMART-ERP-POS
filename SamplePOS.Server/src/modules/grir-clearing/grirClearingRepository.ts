/**
 * GR/IR Clearing Repository
 *
 * SQL-only data access for the GR/IR Clearing module.
 * Follows Controller → Service → Repository layering.
 *
 * SAP Reference: Transaction MR11 (GR/IR Maintenance), F.13 (Automatic Clearing)
 */

import type pg from 'pg';
import { Money } from '../../utils/money.js';

// =============================================================================
// TYPES
// =============================================================================

export interface GrirClearingRow {
    id: string;
    purchase_order_id: string;
    goods_receipt_id: string | null;
    invoice_id: string | null;
    po_amount: string;
    gr_amount: string | null;
    invoice_amount: string | null;
    variance: string;
    status: string;
    matched_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface GrirOpenItemRow {
    gr_id: string;
    gr_number: string;
    gr_date: string | null;
    gr_status: string;
    po_id: string;
    po_number: string;
    po_status: string;
    po_total: string;
    supplier_id: string;
    supplier_name: string;
    supplier_code: string;
    gr_line_total: string;
    invoice_id: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    invoice_total: string | null;
    invoice_status: string | null;
    days_since_gr: number | null;
    clearing_status: string;
    variance: string | null;
}

export interface GrirBalanceSummaryRow {
    total_gr_value: string;
    total_invoiced_value: string;
    clearing_balance: string;
    outstanding_count: string;
    partially_matched_count: string;
    fully_matched_count: string;
    variance_count: string;
    oldest_unmatched_days: string | null;
    avg_clearing_days: string | null;
}

export interface GrirSearchRow extends GrirOpenItemRow {
    rank: number;
}

export interface GrirMatchCandidateRow {
    gr_id: string;
    gr_number: string;
    gr_date: string | null;
    po_id: string;
    po_number: string;
    supplier_id: string;
    supplier_name: string;
    gr_line_total: string;
    invoice_id: string;
    invoice_number: string;
    invoice_date: string | null;
    invoice_total: string;
    amount_diff: string;
    is_exact_match: boolean;
}

// =============================================================================
// OPEN ITEMS — SAP-style MR11 work list
// =============================================================================

/**
 * Get all open GR/IR clearing items.
 * Joins goods_receipts → PO → supplier, then LEFT JOINs invoices via PO link.
 *
 * SAP equivalent: MR11 (GR/IR Account Maintenance) work list
 */
export async function getOpenItems(
    client: pg.Pool | pg.PoolClient,
    filters: {
        supplierId?: string;
        poNumber?: string;
        grNumber?: string;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        offset?: number;
    } = {}
): Promise<{ rows: GrirOpenItemRow[]; total: number }> {
    const conditions: string[] = [`gr.status = 'COMPLETED'`];
    const params: unknown[] = [];
    let idx = 0;

    if (filters.supplierId) {
        conditions.push(`po.supplier_id = $${++idx}`);
        params.push(filters.supplierId);
    }
    if (filters.poNumber) {
        conditions.push(`po.order_number ILIKE $${++idx}`);
        params.push(`%${filters.poNumber}%`);
    }
    if (filters.grNumber) {
        conditions.push(`gr.receipt_number ILIKE $${++idx}`);
        params.push(`%${filters.grNumber}%`);
    }
    if (filters.dateFrom) {
        conditions.push(`gr.received_date >= $${++idx}::date`);
        params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
        conditions.push(`gr.received_date <= $${++idx}::date`);
        params.push(filters.dateTo);
    }
    if (filters.status) {
        // Filter by clearing status (computed below)
        // UNMATCHED = no invoice, PARTIALLY_MATCHED = invoice exists but variance, MATCHED = exact match
        // We handle this with a HAVING clause in the CTE
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countResult = await client.query(
        `SELECT COUNT(DISTINCT gr.id) as total
     FROM goods_receipts gr
     JOIN purchase_orders po ON gr.purchase_order_id = po.id
     ${whereClause}`,
        params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Main query — SAP MR11 work list structure
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    const limitIdx = ++idx;
    const offsetIdx = ++idx;
    params.push(limit, offset);

    const statusFilter = filters.status
        ? `WHERE clearing_status = '${filters.status === 'UNMATCHED' ? 'UNMATCHED' : filters.status === 'MATCHED' ? 'MATCHED' : filters.status === 'VARIANCE' ? 'VARIANCE' : filters.status}'`
        : '';

    const result = await client.query(
        `WITH gr_totals AS (
       SELECT
         gr.id AS gr_id,
         gr.receipt_number AS gr_number,
         gr.received_date::date::text AS gr_date,
         gr.status AS gr_status,
         po.id AS po_id,
         po.order_number AS po_number,
         po.status AS po_status,
         po.total_amount::text AS po_total,
         po.supplier_id,
         s."CompanyName" AS supplier_name,
         s."SupplierCode" AS supplier_code,
         COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)::text AS gr_line_total,
         si."Id" AS invoice_id,
         si."SupplierInvoiceNumber" AS invoice_number,
         si."InvoiceDate"::date::text AS invoice_date,
         si."TotalAmount"::text AS invoice_total,
         si."Status" AS invoice_status,
         EXTRACT(DAY FROM (NOW() - gr.received_date))::int AS days_since_gr,
         CASE
           WHEN si."Id" IS NULL THEN 'UNMATCHED'
           WHEN ABS(COALESCE(SUM(gri.received_quantity * gri.cost_price), 0) - si."TotalAmount") < 0.01 THEN 'MATCHED'
           ELSE 'VARIANCE'
         END AS clearing_status,
         CASE
           WHEN si."Id" IS NOT NULL
           THEN (COALESCE(SUM(gri.received_quantity * gri.cost_price), 0) - si."TotalAmount")::text
           ELSE NULL
         END AS variance
       FROM goods_receipts gr
       JOIN purchase_orders po ON gr.purchase_order_id = po.id
       JOIN suppliers s ON po.supplier_id = s."Id"
       LEFT JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
       LEFT JOIN supplier_invoices si
         ON si."PurchaseOrderId" = po.id
         AND si."Status" NOT IN ('CANCELLED')
         AND (si.deleted_at IS NULL)
       ${whereClause}
       GROUP BY gr.id, gr.receipt_number, gr.received_date, gr.status,
                po.id, po.order_number, po.status, po.total_amount, po.supplier_id,
                s."CompanyName", s."SupplierCode",
                si."Id", si."SupplierInvoiceNumber", si."InvoiceDate", si."TotalAmount", si."Status"
     )
     SELECT * FROM gr_totals
     ${statusFilter}
     ORDER BY
       CASE clearing_status WHEN 'UNMATCHED' THEN 0 WHEN 'VARIANCE' THEN 1 ELSE 2 END,
       gr_date ASC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
    );

    return { rows: result.rows, total };
}

// =============================================================================
// SEARCH — SAP-style F4 help with flexible matching
// =============================================================================

/**
 * SAP-style search across PO numbers, GR numbers, supplier names, invoice numbers.
 * Matches any containing substring (ILIKE).
 */
export async function searchClearingItems(
    client: pg.Pool | pg.PoolClient,
    query: string,
    limit: number = 20
): Promise<GrirSearchRow[]> {
    const searchPattern = `%${query}%`;
    const result = await client.query(
        `WITH matches AS (
       SELECT
         gr.id AS gr_id,
         gr.receipt_number AS gr_number,
         gr.received_date::date::text AS gr_date,
         gr.status AS gr_status,
         po.id AS po_id,
         po.order_number AS po_number,
         po.status AS po_status,
         po.total_amount::text AS po_total,
         po.supplier_id,
         s."CompanyName" AS supplier_name,
         s."SupplierCode" AS supplier_code,
         COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)::text AS gr_line_total,
         si."Id" AS invoice_id,
         si."SupplierInvoiceNumber" AS invoice_number,
         si."InvoiceDate"::date::text AS invoice_date,
         si."TotalAmount"::text AS invoice_total,
         si."Status" AS invoice_status,
         EXTRACT(DAY FROM (NOW() - gr.received_date))::int AS days_since_gr,
         CASE
           WHEN si."Id" IS NULL THEN 'UNMATCHED'
           WHEN ABS(COALESCE(SUM(gri.received_quantity * gri.cost_price), 0) - si."TotalAmount") < 0.01 THEN 'MATCHED'
           ELSE 'VARIANCE'
         END AS clearing_status,
         CASE
           WHEN si."Id" IS NOT NULL
           THEN (COALESCE(SUM(gri.received_quantity * gri.cost_price), 0) - si."TotalAmount")::text
           ELSE NULL
         END AS variance,
         -- Rank by match quality
         CASE
           WHEN po.order_number ILIKE $1 THEN 1
           WHEN gr.receipt_number ILIKE $1 THEN 2
           WHEN si."SupplierInvoiceNumber" ILIKE $1 THEN 3
           WHEN s."CompanyName" ILIKE $1 THEN 4
           WHEN s."SupplierCode" ILIKE $1 THEN 5
           ELSE 6
         END AS rank
       FROM goods_receipts gr
       JOIN purchase_orders po ON gr.purchase_order_id = po.id
       JOIN suppliers s ON po.supplier_id = s."Id"
       LEFT JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
       LEFT JOIN supplier_invoices si
         ON si."PurchaseOrderId" = po.id
         AND si."Status" NOT IN ('CANCELLED')
         AND (si.deleted_at IS NULL)
       WHERE gr.status = 'COMPLETED'
         AND (
           po.order_number ILIKE $1
           OR gr.receipt_number ILIKE $1
           OR s."CompanyName" ILIKE $1
           OR s."SupplierCode" ILIKE $1
           OR si."SupplierInvoiceNumber" ILIKE $1
         )
       GROUP BY gr.id, gr.receipt_number, gr.received_date, gr.status,
                po.id, po.order_number, po.status, po.total_amount, po.supplier_id,
                s."CompanyName", s."SupplierCode",
                si."Id", si."SupplierInvoiceNumber", si."InvoiceDate", si."TotalAmount", si."Status"
     )
     SELECT * FROM matches
     ORDER BY rank, gr_date ASC
     LIMIT $2`,
        [searchPattern, limit]
    );

    return result.rows;
}

// =============================================================================
// MATCH CANDIDATES — For auto-match and manual clearing
// =============================================================================

/**
 * Find GR-Invoice match candidates: GRs that have invoices on the same PO.
 * Returns pairs with amount difference for manual or auto clearing.
 */
export async function getMatchCandidates(
    client: pg.Pool | pg.PoolClient,
    options: { supplierId?: string; tolerancePercent?: number } = {}
): Promise<GrirMatchCandidateRow[]> {
    const conditions: string[] = [
        `gr.status = 'COMPLETED'`,
        `si."Status" NOT IN ('CANCELLED')`,
        `si.deleted_at IS NULL`,
    ];
    const params: unknown[] = [];
    let idx = 0;

    if (options.supplierId) {
        conditions.push(`po.supplier_id = $${++idx}`);
        params.push(options.supplierId);
    }

    const result = await client.query(
        `SELECT
       gr.id AS gr_id,
       gr.receipt_number AS gr_number,
       gr.received_date::date::text AS gr_date,
       po.id AS po_id,
       po.order_number AS po_number,
       po.supplier_id,
       s."CompanyName" AS supplier_name,
       COALESCE(gr_items.total, 0)::text AS gr_line_total,
       si."Id" AS invoice_id,
       si."SupplierInvoiceNumber" AS invoice_number,
       si."InvoiceDate"::date::text AS invoice_date,
       si."TotalAmount"::text AS invoice_total,
       ABS(COALESCE(gr_items.total, 0) - si."TotalAmount")::text AS amount_diff,
       ABS(COALESCE(gr_items.total, 0) - si."TotalAmount") < 0.01 AS is_exact_match
     FROM goods_receipts gr
     JOIN purchase_orders po ON gr.purchase_order_id = po.id
     JOIN suppliers s ON po.supplier_id = s."Id"
     LEFT JOIN (
       SELECT goods_receipt_id, SUM(received_quantity * cost_price) AS total
       FROM goods_receipt_items GROUP BY goods_receipt_id
     ) gr_items ON gr_items.goods_receipt_id = gr.id
     JOIN supplier_invoices si
       ON si."PurchaseOrderId" = po.id
       AND ${conditions.slice(1).join(' AND ')}
     WHERE ${conditions[0]}
       AND NOT EXISTS (
         SELECT 1 FROM grir_clearing gc
         WHERE gc.goods_receipt_id = gr.id
           AND gc.invoice_id = si."Id"
           AND gc.status IN ('MATCHED', 'VARIANCE')
       )
     ${options.supplierId ? `AND po.supplier_id = $1` : ''}
     ORDER BY is_exact_match DESC, amount_diff ASC`,
        params
    );

    return result.rows;
}

// =============================================================================
// CLEARING RECORD CRUD
// =============================================================================

/**
 * Find existing clearing record by GR + Invoice pair, or by PO.
 */
export async function findClearingRecord(
    client: pg.Pool | pg.PoolClient,
    where: { grId?: string; invoiceId?: string; poId?: string }
): Promise<GrirClearingRow | null> {
    if (where.grId && where.invoiceId) {
        const result = await client.query(
            `SELECT * FROM grir_clearing
       WHERE goods_receipt_id = $1 AND invoice_id = $2`,
            [where.grId, where.invoiceId]
        );
        return result.rows[0] || null;
    }
    if (where.poId) {
        const result = await client.query(
            `SELECT * FROM grir_clearing WHERE purchase_order_id = $1
       ORDER BY created_at DESC LIMIT 1`,
            [where.poId]
        );
        return result.rows[0] || null;
    }
    return null;
}

/**
 * Create a clearing record (manual or auto match).
 */
export async function createClearingRecord(
    client: pg.PoolClient,
    data: {
        id: string;
        purchaseOrderId: string;
        goodsReceiptId: string;
        invoiceId: string;
        poAmount: number;
        grAmount: number;
        invoiceAmount: number;
        variance: number;
        status: string;
    }
): Promise<GrirClearingRow> {
    const result = await client.query(
        `INSERT INTO grir_clearing
       (id, purchase_order_id, goods_receipt_id, invoice_id,
        po_amount, gr_amount, invoice_amount, variance, status,
        matched_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             CASE WHEN $9 IN ('MATCHED', 'VARIANCE') THEN NOW() ELSE NULL END,
             NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       invoice_id = EXCLUDED.invoice_id,
       gr_amount = EXCLUDED.gr_amount,
       invoice_amount = EXCLUDED.invoice_amount,
       variance = EXCLUDED.variance,
       status = EXCLUDED.status,
       matched_at = CASE WHEN EXCLUDED.status IN ('MATCHED', 'VARIANCE') THEN NOW() ELSE grir_clearing.matched_at END,
       updated_at = NOW()
     RETURNING *`,
        [
            data.id, data.purchaseOrderId, data.goodsReceiptId, data.invoiceId,
            data.poAmount, data.grAmount, data.invoiceAmount, data.variance, data.status,
        ]
    );
    return result.rows[0];
}

/**
 * Update clearing record status (e.g. reopen, write off).
 */
export async function updateClearingStatus(
    client: pg.PoolClient,
    id: string,
    status: string,
    variance?: number
): Promise<GrirClearingRow> {
    const result = await client.query(
        `UPDATE grir_clearing
     SET status = $2,
         variance = COALESCE($3, variance),
         matched_at = CASE WHEN $2 IN ('MATCHED', 'VARIANCE') THEN NOW() ELSE matched_at END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
        [id, status, variance ?? null]
    );
    return result.rows[0];
}

// =============================================================================
// BALANCE / SUMMARY — SAP FBL3N clearing account drill-down
// =============================================================================

/**
 * Aggregate clearing account balance.
 * Computes from actual GR item totals vs. matched invoices.
 */
export async function getBalanceSummary(
    client: pg.Pool | pg.PoolClient
): Promise<GrirBalanceSummaryRow> {
    const result = await client.query(
        `WITH gr_data AS (
       SELECT
         gr.id AS gr_id,
         gr.purchase_order_id,
         COALESCE(SUM(gri.received_quantity * gri.cost_price), 0) AS gr_value,
         si."Id" AS invoice_id,
         COALESCE(si."TotalAmount", 0) AS invoice_value,
         CASE
           WHEN si."Id" IS NULL THEN 'UNMATCHED'
           WHEN ABS(COALESCE(SUM(gri.received_quantity * gri.cost_price), 0) - si."TotalAmount") < 0.01 THEN 'MATCHED'
           ELSE 'VARIANCE'
         END AS clearing_status,
         EXTRACT(DAY FROM (NOW() - gr.received_date)) AS days_since_gr
       FROM goods_receipts gr
       LEFT JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
       LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
       LEFT JOIN supplier_invoices si
         ON si."PurchaseOrderId" = po.id
         AND si."Status" NOT IN ('CANCELLED')
         AND (si.deleted_at IS NULL)
       WHERE gr.status = 'COMPLETED'
       GROUP BY gr.id, gr.purchase_order_id, gr.received_date,
                si."Id", si."TotalAmount"
     )
     SELECT
       COALESCE(SUM(gr_value), 0)::text AS total_gr_value,
       COALESCE(SUM(CASE WHEN invoice_id IS NOT NULL THEN invoice_value ELSE 0 END), 0)::text AS total_invoiced_value,
       COALESCE(SUM(CASE WHEN clearing_status = 'UNMATCHED' THEN gr_value ELSE gr_value - invoice_value END), 0)::text AS clearing_balance,
       COUNT(*) FILTER (WHERE clearing_status = 'UNMATCHED')::text AS outstanding_count,
       COUNT(*) FILTER (WHERE clearing_status = 'VARIANCE')::text AS partially_matched_count,
       COUNT(*) FILTER (WHERE clearing_status = 'MATCHED')::text AS fully_matched_count,
       COUNT(*) FILTER (WHERE clearing_status = 'VARIANCE')::text AS variance_count,
       MAX(CASE WHEN clearing_status = 'UNMATCHED' THEN days_since_gr ELSE NULL END)::text AS oldest_unmatched_days,
       AVG(CASE WHEN clearing_status = 'MATCHED' THEN days_since_gr ELSE NULL END)::text AS avg_clearing_days
     FROM gr_data`
    );

    return result.rows[0];
}

/**
 * Get clearing history for a specific PO (all clearing records).
 */
export async function getClearingHistory(
    client: pg.Pool | pg.PoolClient,
    purchaseOrderId: string
): Promise<GrirClearingRow[]> {
    const result = await client.query(
        `SELECT * FROM grir_clearing
     WHERE purchase_order_id = $1
     ORDER BY created_at DESC`,
        [purchaseOrderId]
    );
    return result.rows;
}

/**
 * Get GR item-level details for a goods receipt (for 3-way matching drill-down).
 */
export async function getGrItemDetails(
    client: pg.Pool | pg.PoolClient,
    goodsReceiptId: string
): Promise<Array<{
    product_id: string;
    product_name: string;
    sku: string;
    received_quantity: string;
    cost_price: string;
    line_total: string;
    po_unit_price: string;
    po_quantity: string;
    price_variance: string;
    quantity_variance: string;
}>> {
    const result = await client.query(
        `SELECT
       gri.product_id,
       p.name AS product_name,
       p.sku,
       gri.received_quantity::text,
       gri.cost_price::text,
       (gri.received_quantity * gri.cost_price)::text AS line_total,
       COALESCE(poi.unit_price, 0)::text AS po_unit_price,
       COALESCE(poi.ordered_quantity, 0)::text AS po_quantity,
       (gri.cost_price - COALESCE(poi.unit_price, 0))::text AS price_variance,
       (gri.received_quantity - COALESCE(poi.ordered_quantity, 0))::text AS quantity_variance
     FROM goods_receipt_items gri
     JOIN products p ON p.id = gri.product_id
     LEFT JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id
     LEFT JOIN purchase_order_items poi
       ON poi.purchase_order_id = gr.purchase_order_id
       AND poi.product_id = gri.product_id
     WHERE gri.goods_receipt_id = $1
     ORDER BY p.name`,
        [goodsReceiptId]
    );
    return result.rows;
}
