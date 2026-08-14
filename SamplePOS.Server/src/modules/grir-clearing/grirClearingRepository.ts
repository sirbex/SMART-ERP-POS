/**
 * GR/IR Clearing Repository
 *
 * SQL-only data access for the GR/IR Clearing module.
 * Follows Controller → Service → Repository layering.
 *
 * SAP Reference: Transaction MR11 (GR/IR Maintenance), F.13 (Automatic Clearing)
 *
 * Integrity SSOT:
 *   - GR↔bill multi-path via SI_LINKS_GR_SQL (grn_links / PO / internal ref)
 *   - Soft cancel statuses via SI_ACTIVE_SQL
 *   - Empty-shell GRs excluded via GR_HAS_LINES_SQL
 */

import type pg from 'pg';
import { resolveSupplierFilter } from './supplierFilter.js';
import {
    GR_HAS_LINES_SQL,
    normalizeOpenStatusFilter,
    SI_ACTIVE_SQL,
    SI_LINKS_GR_SQL,
} from './grirIntegrity.js';

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
 * Multi-path bill link + grir_clearing status preference; empty GRs excluded.
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
    const sf = resolveSupplierFilter(filters.supplierId);
    const statusNorm = normalizeOpenStatusFilter(filters.status);
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const qParams: unknown[] = [];
    let q = 0;
    const grWhere: string[] = [`gr.status = 'COMPLETED'`, GR_HAS_LINES_SQL];
    if (filters.poNumber) {
        grWhere.push(`COALESCE(po.order_number, '') ILIKE $${++q}`);
        qParams.push(`%${filters.poNumber}%`);
    }
    if (filters.grNumber) {
        grWhere.push(`gr.receipt_number ILIKE $${++q}`);
        qParams.push(`%${filters.grNumber}%`);
    }
    if (filters.dateFrom) {
        grWhere.push(`gr.received_date >= $${++q}::date`);
        qParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
        grWhere.push(`gr.received_date <= $${++q}::date`);
        qParams.push(filters.dateTo);
    }

    const outerWhere: string[] = ['rn = 1'];
    if (sf.mode === 'id') {
        outerWhere.push(`COALESCE(supplier_id::text, '') = $${++q}`);
        qParams.push(sf.supplierId);
    } else if (sf.mode === 'search') {
        outerWhere.push(
            `(COALESCE(supplier_name, '') ILIKE $${++q} OR COALESCE(supplier_code, '') ILIKE $${q})`,
        );
        qParams.push(`%${sf.supplierSearch}%`);
    }
    if (statusNorm) {
        outerWhere.push(`clearing_status = $${++q}`);
        qParams.push(statusNorm);
    }

    const limitIdx = ++q;
    const offsetIdx = ++q;
    qParams.push(limit, offset);

    const pageSql = `
      WITH gr_base AS (
        SELECT
          gr.id AS gr_id,
          gr.receipt_number AS gr_number,
          gr.received_date::date::text AS gr_date,
          gr.status AS gr_status,
          po.id AS po_id,
          COALESCE(po.order_number, '—') AS po_number,
          COALESCE(po.status::text, '—') AS po_status,
          COALESCE(po.total_amount, 0)::text AS po_total,
          po.supplier_id AS po_supplier_id,
          COALESCE(gr_items.total, 0) AS gr_line_total_n,
          EXTRACT(DAY FROM (NOW() - gr.received_date))::int AS days_since_gr
        FROM goods_receipts gr
        LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
        LEFT JOIN (
          SELECT goods_receipt_id, SUM(received_quantity * cost_price) AS total
          FROM goods_receipt_items
          GROUP BY goods_receipt_id
        ) gr_items ON gr_items.goods_receipt_id = gr.id
        WHERE ${grWhere.join(' AND ')}
      ),
      ranked AS (
        SELECT
          b.gr_id,
          b.gr_number,
          b.gr_date,
          b.gr_status,
          b.po_id,
          b.po_number,
          b.po_status,
          b.po_total,
          b.gr_line_total_n,
          b.days_since_gr,
          COALESCE(b.po_supplier_id, si."SupplierId") AS supplier_id,
          COALESCE(s."CompanyName", 'Unknown') AS supplier_name,
          COALESCE(s."SupplierCode", '') AS supplier_code,
          si."Id" AS invoice_id,
          si."SupplierInvoiceNumber" AS invoice_number,
          si."InvoiceDate"::date::text AS invoice_date,
          si."TotalAmount" AS invoice_total_n,
          si."Status" AS invoice_status,
          gc.status AS gc_status,
          gc.variance AS gc_variance,
          ROW_NUMBER() OVER (
            PARTITION BY b.gr_id
            ORDER BY
              CASE WHEN gc.status IN ('MATCHED', 'VARIANCE') THEN 0 ELSE 1 END,
              ABS(b.gr_line_total_n - COALESCE(si."TotalAmount", 0)),
              si."InvoiceDate" DESC NULLS LAST
          ) AS rn,
          CASE
            WHEN gc.status IN ('MATCHED', 'VARIANCE') THEN gc.status
            WHEN si."Id" IS NULL THEN 'UNMATCHED'
            WHEN ABS(b.gr_line_total_n - COALESCE(si."TotalAmount", 0)) < 0.01 THEN 'MATCHED'
            ELSE 'VARIANCE'
          END AS clearing_status
        FROM gr_base b
        LEFT JOIN goods_receipts gr ON gr.id = b.gr_id
        LEFT JOIN supplier_invoices si ON (${SI_ACTIVE_SQL}) AND (${SI_LINKS_GR_SQL})
        LEFT JOIN grir_clearing gc
          ON gc.goods_receipt_id = b.gr_id
          AND (si."Id" IS NULL OR gc.invoice_id = si."Id")
          AND gc.status IN ('MATCHED', 'VARIANCE')
        LEFT JOIN suppliers s ON s."Id" = COALESCE(b.po_supplier_id, si."SupplierId")
      )
      SELECT
        gr_id,
        gr_number,
        gr_date,
        gr_status,
        COALESCE(po_id::text, '') AS po_id,
        po_number,
        po_status,
        po_total,
        COALESCE(supplier_id::text, '') AS supplier_id,
        supplier_name,
        supplier_code,
        gr_line_total_n::text AS gr_line_total,
        invoice_id,
        invoice_number,
        invoice_date,
        invoice_total_n::text AS invoice_total,
        invoice_status,
        days_since_gr,
        clearing_status,
        CASE
          WHEN gc_status IN ('MATCHED', 'VARIANCE') AND gc_variance IS NOT NULL
            THEN gc_variance::text
          WHEN invoice_id IS NOT NULL
            THEN (gr_line_total_n - invoice_total_n)::text
          ELSE NULL
        END AS variance,
        COUNT(*) OVER()::int AS _total
      FROM ranked
      WHERE ${outerWhere.join(' AND ')}
      ORDER BY
        CASE clearing_status WHEN 'UNMATCHED' THEN 0 WHEN 'VARIANCE' THEN 1 ELSE 2 END,
        gr_date ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const result = await client.query(pageSql, qParams);
    const total =
        result.rows.length > 0 ? parseInt(String(result.rows[0]._total), 10) : 0;

    const rows = result.rows.map((r: Record<string, unknown>): GrirOpenItemRow => {
        const { _total, ...rest } = r;
        void _total;
        // pg returns Record-shaped rows; double assertion is intentional (query aliases match GrirOpenItemRow).
        return rest as unknown as GrirOpenItemRow;
    });

    return { rows, total };
}

// =============================================================================
// SEARCH — SAP-style F4 help with flexible matching
// =============================================================================

/**
 * SAP-style search across PO numbers, GR numbers, supplier names, invoice numbers.
 */
export async function searchClearingItems(
    client: pg.Pool | pg.PoolClient,
    query: string,
    limit: number = 20
): Promise<GrirSearchRow[]> {
    const searchPattern = `%${query}%`;
    const result = await client.query(
        `WITH ranked AS (
       SELECT
         gr.id AS gr_id,
         gr.receipt_number AS gr_number,
         gr.received_date::date::text AS gr_date,
         gr.status AS gr_status,
         po.id AS po_id,
         COALESCE(po.order_number, '—') AS po_number,
         COALESCE(po.status::text, '—') AS po_status,
         COALESCE(po.total_amount, 0)::text AS po_total,
         COALESCE(po.supplier_id, si."SupplierId") AS supplier_id,
         COALESCE(s."CompanyName", 'Unknown') AS supplier_name,
         COALESCE(s."SupplierCode", '') AS supplier_code,
         COALESCE(gr_items.total, 0) AS gr_line_total_n,
         si."Id" AS invoice_id,
         si."SupplierInvoiceNumber" AS invoice_number,
         si."InvoiceDate"::date::text AS invoice_date,
         si."TotalAmount" AS invoice_total_n,
         si."Status" AS invoice_status,
         EXTRACT(DAY FROM (NOW() - gr.received_date))::int AS days_since_gr,
         gc.status AS gc_status,
         gc.variance AS gc_variance,
         CASE
           WHEN gc.status IN ('MATCHED', 'VARIANCE') THEN gc.status
           WHEN si."Id" IS NULL THEN 'UNMATCHED'
           WHEN ABS(COALESCE(gr_items.total, 0) - COALESCE(si."TotalAmount", 0)) < 0.01 THEN 'MATCHED'
           ELSE 'VARIANCE'
         END AS clearing_status,
         CASE
           WHEN po.order_number ILIKE $1 THEN 1
           WHEN gr.receipt_number ILIKE $1 THEN 2
           WHEN si."SupplierInvoiceNumber" ILIKE $1 THEN 3
           WHEN s."CompanyName" ILIKE $1 THEN 4
           WHEN s."SupplierCode" ILIKE $1 THEN 5
           ELSE 6
         END AS rank,
         ROW_NUMBER() OVER (
           PARTITION BY gr.id
           ORDER BY ABS(COALESCE(gr_items.total, 0) - COALESCE(si."TotalAmount", 0)), si."InvoiceDate" DESC NULLS LAST
         ) AS rn
       FROM goods_receipts gr
       LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
       LEFT JOIN (
         SELECT goods_receipt_id, SUM(received_quantity * cost_price) AS total
         FROM goods_receipt_items
         GROUP BY goods_receipt_id
       ) gr_items ON gr_items.goods_receipt_id = gr.id
       LEFT JOIN supplier_invoices si ON (${SI_ACTIVE_SQL}) AND (${SI_LINKS_GR_SQL})
       LEFT JOIN grir_clearing gc
         ON gc.goods_receipt_id = gr.id
         AND (si."Id" IS NULL OR gc.invoice_id = si."Id")
         AND gc.status IN ('MATCHED', 'VARIANCE')
       LEFT JOIN suppliers s ON s."Id" = COALESCE(po.supplier_id, si."SupplierId")
       WHERE gr.status = 'COMPLETED'
         AND ${GR_HAS_LINES_SQL}
         AND (
           COALESCE(po.order_number, '') ILIKE $1
           OR gr.receipt_number ILIKE $1
           OR COALESCE(s."CompanyName", '') ILIKE $1
           OR COALESCE(s."SupplierCode", '') ILIKE $1
           OR COALESCE(si."SupplierInvoiceNumber", '') ILIKE $1
         )
     )
     SELECT
       gr_id,
       gr_number,
       gr_date,
       gr_status,
       COALESCE(po_id::text, '') AS po_id,
       po_number,
       po_status,
       po_total,
       COALESCE(supplier_id::text, '') AS supplier_id,
       supplier_name,
       supplier_code,
       gr_line_total_n::text AS gr_line_total,
       invoice_id,
       invoice_number,
       invoice_date,
       invoice_total_n::text AS invoice_total,
       invoice_status,
       days_since_gr,
       clearing_status,
       CASE
         WHEN gc_status IN ('MATCHED', 'VARIANCE') AND gc_variance IS NOT NULL THEN gc_variance::text
         WHEN invoice_id IS NOT NULL THEN (gr_line_total_n - invoice_total_n)::text
         ELSE NULL
       END AS variance,
       rank
     FROM ranked
     WHERE rn = 1
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
 * Find GR↔invoice match candidates for F.13 auto-match / preview.
 * Returns all possible pairs (may be many:1); service applies 1:1 + tolerance SSOT.
 */
export async function getMatchCandidates(
    client: pg.Pool | pg.PoolClient,
    options: { supplierId?: string; tolerancePercent?: number } = {}
): Promise<GrirMatchCandidateRow[]> {
    // tolerancePercent intentionally ignored here — selection is service SSOT (selectF13Pairs)
    void options.tolerancePercent;

    const whereConditions: string[] = [
        `gr.status = 'COMPLETED'`,
        GR_HAS_LINES_SQL,
    ];
    const params: unknown[] = [];
    let idx = 0;

    const supplierFilter = resolveSupplierFilter(options.supplierId);
    if (supplierFilter.mode === 'id') {
        whereConditions.push(
            `COALESCE(po.supplier_id, si."SupplierId") = $${++idx}`,
        );
        params.push(supplierFilter.supplierId);
    } else if (supplierFilter.mode === 'search') {
        whereConditions.push(
            `(s."CompanyName" ILIKE $${++idx} OR COALESCE(s."SupplierCode", '') ILIKE $${idx})`,
        );
        params.push(`%${supplierFilter.supplierSearch}%`);
    }

    const result = await client.query(
        `SELECT
       gr.id AS gr_id,
       gr.receipt_number AS gr_number,
       gr.received_date::date::text AS gr_date,
       po.id AS po_id,
       COALESCE(po.order_number, '—') AS po_number,
       COALESCE(po.supplier_id, si."SupplierId") AS supplier_id,
       COALESCE(s."CompanyName", 'Unknown') AS supplier_name,
       COALESCE(gr_items.total, 0)::text AS gr_line_total,
       si."Id" AS invoice_id,
       si."SupplierInvoiceNumber" AS invoice_number,
       si."InvoiceDate"::date::text AS invoice_date,
       si."TotalAmount"::text AS invoice_total,
       ABS(COALESCE(gr_items.total, 0) - si."TotalAmount")::text AS amount_diff,
       ABS(COALESCE(gr_items.total, 0) - si."TotalAmount") < 0.01 AS is_exact_match
     FROM goods_receipts gr
     LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
     LEFT JOIN (
       SELECT goods_receipt_id, SUM(received_quantity * cost_price) AS total
       FROM goods_receipt_items
       GROUP BY goods_receipt_id
     ) gr_items ON gr_items.goods_receipt_id = gr.id
     INNER JOIN supplier_invoices si ON (${SI_ACTIVE_SQL}) AND (${SI_LINKS_GR_SQL})
     LEFT JOIN suppliers s ON s."Id" = COALESCE(po.supplier_id, si."SupplierId")
     WHERE ${whereConditions.join(' AND ')}
       AND NOT EXISTS (
         SELECT 1 FROM grir_clearing gc
         WHERE gc.goods_receipt_id = gr.id
           AND gc.invoice_id = si."Id"
           AND gc.status IN ('MATCHED', 'VARIANCE')
       )
     ORDER BY is_exact_match DESC, amount_diff ASC, gr.received_date ASC`,
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
    const matchedAt = ['MATCHED', 'VARIANCE'].includes(data.status) ? new Date() : null;
    const result = await client.query(
        `INSERT INTO grir_clearing
       (id, purchase_order_id, goods_receipt_id, invoice_id,
        po_amount, gr_amount, invoice_amount, variance, status,
        matched_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
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
            matchedAt,
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
    const shouldSetMatchedAt = ['MATCHED', 'VARIANCE'].includes(status);
    const result = await client.query(
        `UPDATE grir_clearing
     SET status = $2,
         variance = COALESCE($3, variance),
         matched_at = CASE WHEN $4 THEN NOW() ELSE matched_at END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
        [id, status, variance ?? null, shouldSetMatchedAt]
    );
    return result.rows[0];
}

// =============================================================================
// BALANCE / SUMMARY — SAP FBL3N clearing account drill-down
// =============================================================================

/**
 * Aggregate clearing account balance from multi-path GR↔bill pairs (one row per GR).
 */
export async function getBalanceSummary(
    client: pg.Pool | pg.PoolClient
): Promise<GrirBalanceSummaryRow> {
    const result = await client.query(
        `WITH gr_base AS (
       SELECT
         gr.id AS gr_id,
         gr.received_date,
         COALESCE(gr_items.total, 0) AS gr_value
       FROM goods_receipts gr
       LEFT JOIN (
         SELECT goods_receipt_id, SUM(received_quantity * cost_price) AS total
         FROM goods_receipt_items
         GROUP BY goods_receipt_id
       ) gr_items ON gr_items.goods_receipt_id = gr.id
       WHERE gr.status = 'COMPLETED'
         AND ${GR_HAS_LINES_SQL}
     ),
     ranked AS (
       SELECT
         b.gr_id,
         b.gr_value,
         b.received_date,
         si."Id" AS invoice_id,
         COALESCE(si."TotalAmount", 0) AS invoice_value,
         gc.status AS gc_status,
         ROW_NUMBER() OVER (
           PARTITION BY b.gr_id
           ORDER BY
             CASE WHEN gc.status IN ('MATCHED', 'VARIANCE') THEN 0 ELSE 1 END,
             ABS(b.gr_value - COALESCE(si."TotalAmount", 0)),
             si."InvoiceDate" DESC NULLS LAST
         ) AS rn,
         CASE
           WHEN gc.status IN ('MATCHED', 'VARIANCE') THEN gc.status
           WHEN si."Id" IS NULL THEN 'UNMATCHED'
           WHEN ABS(b.gr_value - COALESCE(si."TotalAmount", 0)) < 0.01 THEN 'MATCHED'
           ELSE 'VARIANCE'
         END AS clearing_status,
         EXTRACT(DAY FROM (NOW() - b.received_date)) AS days_since_gr
       FROM gr_base b
       LEFT JOIN goods_receipts gr ON gr.id = b.gr_id
       LEFT JOIN supplier_invoices si ON (${SI_ACTIVE_SQL}) AND (${SI_LINKS_GR_SQL})
       LEFT JOIN grir_clearing gc
         ON gc.goods_receipt_id = b.gr_id
         AND (si."Id" IS NULL OR gc.invoice_id = si."Id")
         AND gc.status IN ('MATCHED', 'VARIANCE')
     ),
     gr_data AS (
       SELECT * FROM ranked WHERE rn = 1
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

// =============================================================================
// PURITY DIAGNOSTIC — detect 2150 pollution from RGRN / supplier credit notes
// =============================================================================

const GL_NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND COALESCE(lt."IsReversed", FALSE) = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

export async function getGrirPurityDiagnostic(
    client: pg.Pool | pg.PoolClient
): Promise<{
    pure_balance: string;
    polluted_balance: string;
    total_gl_balance: string;
    polluted_entry_count: string;
}> {
    const result = await client.query(
        `SELECT
           COALESCE(SUM(CASE
             WHEN lt."ReferenceType" IN ('GOODS_RECEIPT', 'SUPPLIER_INVOICE')
             THEN le."CreditAmount" - le."DebitAmount"
             ELSE 0
           END), 0)::text AS pure_balance,
           COALESCE(SUM(CASE
             WHEN lt."ReferenceType" IN ('RETURN_GRN', 'SUPPLIER_CREDIT_NOTE')
             THEN le."CreditAmount" - le."DebitAmount"
             ELSE 0
           END), 0)::text AS polluted_balance,
           COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0)::text AS total_gl_balance,
           COUNT(*) FILTER (
             WHERE lt."ReferenceType" IN ('RETURN_GRN', 'SUPPLIER_CREDIT_NOTE')
           )::text AS polluted_entry_count
         FROM ledger_entries le
         JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '2150'
           AND ${GL_NET_ACTIVE}`
    );
    return result.rows[0];
}

export async function getGlResiduals(
    client: pg.Pool | pg.PoolClient,
    options: { limit?: number; minAbs?: number } = {}
): Promise<Array<{
    reference_number: string;
    reference_type: string;
    net_cr: string;
    first_date: string | null;
    last_date: string | null;
    txn_count: string;
    description_sample: string | null;
}>> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const minAbs = options.minAbs ?? 0.01;
    const result = await client.query(
        `SELECT
           COALESCE(lt."ReferenceNumber", '(blank)') AS reference_number,
           COALESCE(lt."ReferenceType", 'UNKNOWN') AS reference_type,
           ROUND(SUM(le."CreditAmount" - le."DebitAmount")::numeric, 2)::text AS net_cr,
           MIN(lt."TransactionDate")::date::text AS first_date,
           MAX(lt."TransactionDate")::date::text AS last_date,
           COUNT(DISTINCT lt."Id")::text AS txn_count,
           LEFT(MAX(COALESCE(lt."Description", '')), 120) AS description_sample
         FROM ledger_entries le
         JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '2150'
           AND ${GL_NET_ACTIVE}
         GROUP BY COALESCE(lt."ReferenceNumber", '(blank)'), COALESCE(lt."ReferenceType", 'UNKNOWN')
         HAVING ABS(SUM(le."CreditAmount" - le."DebitAmount")) >= $1
         ORDER BY ABS(SUM(le."CreditAmount" - le."DebitAmount")) DESC
         LIMIT $2`,
        [minAbs, limit]
    );
    return result.rows;
}

export async function getGlResidualForReference(
    client: pg.Pool | pg.PoolClient,
    referenceNumber: string
): Promise<{ reference_number: string; reference_type: string; net_cr: string } | null> {
    const result = await client.query(
        `SELECT
           COALESCE(lt."ReferenceNumber", '(blank)') AS reference_number,
           COALESCE(MAX(lt."ReferenceType"), 'UNKNOWN') AS reference_type,
           ROUND(SUM(le."CreditAmount" - le."DebitAmount")::numeric, 2)::text AS net_cr
         FROM ledger_entries le
         JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '2150'
           AND ${GL_NET_ACTIVE}
           AND lt."ReferenceNumber" = $1
         GROUP BY COALESCE(lt."ReferenceNumber", '(blank)')
         HAVING ABS(SUM(le."CreditAmount" - le."DebitAmount")) >= 0.01`,
        [referenceNumber]
    );
    return result.rows[0] || null;
}

export async function getTrueGlBalance(
    client: pg.Pool | pg.PoolClient
): Promise<{ gl_balance_cr: string; entry_count: string }> {
    const result = await client.query(
        `SELECT
           ROUND(COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0)::numeric, 2)::text AS gl_balance_cr,
           COUNT(*)::text AS entry_count
         FROM ledger_entries le
         JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '2150'
           AND ${GL_NET_ACTIVE}`
    );
    return result.rows[0];
}
