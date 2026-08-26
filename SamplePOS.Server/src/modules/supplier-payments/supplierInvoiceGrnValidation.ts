/**
 * GR-linked supplier invoice bounds — invoice totals must not exceed received
 * value unless an explicit, direction-correct variance reason is recorded.
 */
import type { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import { PricingEngine } from '../../utils/pricingEngine.js';

export type SupplierInvoiceVarianceReason =
  | 'SUPPLIER_DISCOUNT'
  | 'ROUNDING_DIFFERENCE'
  | 'PRICE_VARIANCE'
  | 'EDIT_LINE_PRICES';

type DbConn = Pool | PoolClient;

export interface GrnVarianceValidationInput {
  grnComputedTotal: number | Decimal;
  invoiceTotal: number | Decimal;
  varianceReason?: string | null;
  grLabel?: string;
}

export interface GrnVarianceValidationResult {
  hasVariance: boolean;
  varianceAmount: number;
  normalizedReason?: SupplierInvoiceVarianceReason;
}

/** Sum billable (non-bonus) GRN line value for one or more receipts. */
export async function computeGrnBillableTotal(
  conn: DbConn,
  grnIds: string[],
): Promise<Decimal> {
  if (grnIds.length === 0) {
    return new Decimal(0);
  }
  const result = await conn.query<{ total: string }>(
    `SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)::text AS total
     FROM goods_receipt_items gri
     WHERE gri.goods_receipt_id = ANY($1::uuid[])
       AND COALESCE(gri.is_bonus, false) = false`,
    [grnIds],
  );
  return new Decimal(result.rows[0]?.total ?? 0);
}

/**
 * Ensure every linked GRN exists, is COMPLETED, and (when supplierId given) belongs
 * to that supplier. Prevents fake/wrong grnIds from yielding a 0 total + PRICE_VARIANCE bypass.
 */
export async function assertLinkedGrnsReadyForBilling(
  conn: DbConn,
  grnIds: string[],
  supplierId?: string,
): Promise<{ receiptNumbers: string[]; billableTotal: Decimal }> {
  if (grnIds.length === 0) {
    throw new ValidationError('At least one goods receipt id is required for GR-linked billing');
  }

  const uniqueIds = [...new Set(grnIds)];
  const result = await conn.query<{
    id: string;
    receipt_number: string;
    status: string;
    supplier_id: string | null;
  }>(
    `SELECT gr.id::text AS id,
            gr.receipt_number,
            gr.status,
            po.supplier_id::text AS supplier_id
     FROM goods_receipts gr
     LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
     WHERE gr.id = ANY($1::uuid[])`,
    [uniqueIds],
  );

  if (result.rows.length !== uniqueIds.length) {
    const found = new Set(result.rows.map((r) => r.id));
    const missing = uniqueIds.filter((id) => !found.has(id));
    throw new ValidationError(
      `Cannot bill: goods receipt not found (${missing.slice(0, 3).join(', ')})`,
    );
  }

  for (const row of result.rows) {
    if (row.status !== 'COMPLETED') {
      throw new ValidationError(
        `Cannot bill ${row.receipt_number}: status is ${row.status}, expected COMPLETED`,
      );
    }
    if (supplierId && row.supplier_id && row.supplier_id !== supplierId) {
      throw new ValidationError(
        `Cannot bill ${row.receipt_number}: receipt belongs to a different supplier`,
      );
    }
  }

  const billableTotal = await computeGrnBillableTotal(conn, uniqueIds);
  if (billableTotal.lessThanOrEqualTo(0.0001)) {
    throw new ValidationError(
      `Cannot bill ${result.rows.map((r) => r.receipt_number).join(', ')}: no billable (non-bonus) received value`,
    );
  }

  return {
    receiptNumbers: result.rows.map((r) => r.receipt_number),
    billableTotal,
  };
}

/**
 * Enforce SAP/Odoo-style 3-way match bounds:
 * - Within tolerance → no variance metadata required
 * - Over GRN → PRICE_VARIANCE only (supplier billed more than received)
 * - Under GRN → SUPPLIER_DISCOUNT or ROUNDING_DIFFERENCE only
 * - EDIT_LINE_PRICES → always reject (fix GRN costs first)
 */
export function validateSupplierInvoiceGrnVariance(
  input: GrnVarianceValidationInput,
): GrnVarianceValidationResult {
  const grnTotal = new Decimal(input.grnComputedTotal);
  const invoiceTotal = new Decimal(input.invoiceTotal);
  const label = input.grLabel ? ` for ${input.grLabel}` : '';
  const reason = input.varianceReason?.trim() || undefined;

  if (!PricingEngine.hasVariance(grnTotal, invoiceTotal)) {
    return { hasVariance: false, varianceAmount: 0 };
  }

  const varianceAmount = PricingEngine.calculateVariance(grnTotal, invoiceTotal).toNumber();
  const absVar = Math.abs(varianceAmount);

  if (!reason) {
    throw new ValidationError(
      `Supplier bill total differs from goods received value${label} by UGX ${absVar.toFixed(2)}. ` +
        `Select a variance reason (PRICE_VARIANCE if the supplier billed more, ` +
        `SUPPLIER_DISCOUNT or ROUNDING_DIFFERENCE if less), or correct the bill to match the receipt.`,
    );
  }

  if (reason === 'EDIT_LINE_PRICES') {
    throw new ValidationError(
      `Bill differs from received value${label} by UGX ${absVar.toFixed(2)}. ` +
        `Correct unit costs on the Goods Receipt first, then create the supplier bill again.`,
    );
  }

  const unfavorable = invoiceTotal.greaterThan(grnTotal);
  const favorable = invoiceTotal.lessThan(grnTotal);

  if (unfavorable && reason !== 'PRICE_VARIANCE') {
    throw new ValidationError(
      `Supplier bill (${invoiceTotal.toFixed(2)}) exceeds goods received value (${grnTotal.toFixed(2)})${label}. ` +
        `Use PRICE_VARIANCE only when the supplier legitimately billed more than received, ` +
        `or reduce the bill to match the receipt.`,
    );
  }

  if (favorable && reason === 'PRICE_VARIANCE') {
    throw new ValidationError(
      `Supplier bill (${invoiceTotal.toFixed(2)}) is below goods received value (${grnTotal.toFixed(2)})${label}. ` +
        `Use SUPPLIER_DISCOUNT or ROUNDING_DIFFERENCE for favorable variances.`,
    );
  }

  if (
    favorable &&
    reason !== 'SUPPLIER_DISCOUNT' &&
    reason !== 'ROUNDING_DIFFERENCE'
  ) {
    throw new ValidationError(
      `Unrecognized variance reason "${reason}" for a bill below received value${label}.`,
    );
  }

  return {
    hasVariance: true,
    varianceAmount,
    normalizedReason: reason as SupplierInvoiceVarianceReason,
  };
}
