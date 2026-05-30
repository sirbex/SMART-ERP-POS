/**
 * Restore physical inventory when a customer credit note returns goods.
 * Mirrors sale refund / RETURN_GRN patterns: batch qty must change before syncProductQuantity.
 */
import type { PoolClient } from 'pg';
import { Money } from './money.js';
import { syncProductQuantity } from './inventorySync.js';
import { recordMovement } from '../modules/stock-movements/stockMovementRepository.js';
import { assertPositiveFinite } from './safeParse.js';

const SALE_ITEM_ID_RE = /sale_item:([0-9a-f-]{36})/i;

export type CustomerReturnRestoreResult = {
  batchId: string | null;
  baseQty: number;
  unitCost: number;
};

type RestoreParams = {
  productId: string;
  enteredQty: number;
  lineDescription: string | null;
  noteId: string;
  noteNumber: string;
  fallbackUnitCost: number;
};

async function readOnHand(client: PoolClient, productId: string): Promise<number> {
  const res = await client.query<{ qty: string | number }>(
    `SELECT COALESCE(quantity_on_hand, 0) AS qty FROM products WHERE id = $1`,
    [productId],
  );
  return Money.toNumber(Money.parseDb(res.rows[0]?.qty ?? 0));
}

/**
 * Fail the transaction if return posting did not increase on-hand (prevents silent 0-qty bugs).
 */
async function assertOnHandAfterCustomerReturn(
  client: PoolClient,
  productId: string,
  beforeQty: number,
  expectedIncrease: number,
  noteNumber: string,
): Promise<void> {
  const afterQty = await readOnHand(client, productId);
  const minExpected = beforeQty + expectedIncrease - 0.001;
  if (afterQty + 0.001 < minExpected) {
    throw new Error(
      `Customer return inventory sync failed for ${noteNumber}: `
        + `on-hand ${afterQty} (expected at least ${minExpected.toFixed(3)} after +${expectedIncrease})`,
    );
  }
}

async function resolveSaleItemFromNote(
  client: PoolClient,
  noteId: string,
  productId: string,
): Promise<{
  saleItemId: string;
  batch_id: string | null;
  conversion_factor: string | number | null;
  unit_cost: string | number | null;
} | null> {
  const res = await client.query<{
    id: string;
    batch_id: string | null;
    conversion_factor: string | number | null;
    unit_cost: string | number | null;
  }>(
    `SELECT si.id, si.batch_id, si.conversion_factor, si.unit_cost
     FROM invoices cn
     JOIN invoices inv ON inv.id = cn.reference_invoice_id
     JOIN sales s ON s.id = inv.sale_id
     JOIN sale_items si ON si.sale_id = s.id AND si.product_id = $2::uuid
     WHERE cn.id = $1
     ORDER BY si.created_at DESC
     LIMIT 1`,
    [noteId, productId],
  );
  return res.rows[0] ?? null;
}

async function resolveReturnQuantities(
  client: PoolClient,
  params: RestoreParams,
): Promise<{ batchId: string | null; baseQty: number; unitCost: number }> {
  const enteredQty = assertPositiveFinite(params.enteredQty, 'Return quantity');

  let saleItemId: string | null = null;
  const desc = (params.lineDescription ?? '').trim();
  const saleItemMatch = desc.match(SALE_ITEM_ID_RE);
  if (saleItemMatch) {
    saleItemId = saleItemMatch[1];
  }

  let batchId: string | null = null;
  let unitCost = params.fallbackUnitCost;
  let baseQty = enteredQty;

  let si: {
    batch_id: string | null;
    conversion_factor: string | number | null;
    unit_cost: string | number | null;
  } | undefined;

  if (saleItemId) {
    const siRes = await client.query<{
      batch_id: string | null;
      conversion_factor: string | number | null;
      unit_cost: string | number | null;
    }>(
      `SELECT batch_id, conversion_factor, unit_cost
       FROM sale_items WHERE id = $1`,
      [saleItemId],
    );
    si = siRes.rows[0];
  } else if (params.noteId && params.productId) {
    const linked = await resolveSaleItemFromNote(client, params.noteId, params.productId);
    if (linked) {
      saleItemId = linked.id;
      si = linked;
    }
  }

  if (si) {
    batchId = si.batch_id;
    const conv = Money.toNumber(Money.parseDb(si.conversion_factor ?? 1));
    baseQty = assertPositiveFinite(
      Money.toNumber(Money.multiply(enteredQty, conv)),
      'Return quantity (base UoM)',
    );
    unitCost = Money.toNumber(Money.parseDb(si.unit_cost ?? unitCost));
  }

  return { batchId, baseQty, unitCost };
}

async function applyBatchRestore(
  client: PoolClient,
  productId: string,
  noteNumber: string,
  batchId: string | null,
  baseQty: number,
  unitCost: number,
): Promise<string | null> {
  if (batchId) {
    await client.query(
      `UPDATE inventory_batches
       SET remaining_quantity = remaining_quantity + $1,
           status = CASE
             WHEN remaining_quantity + $1 > 0 THEN 'ACTIVE'::batch_status
             ELSE status
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [baseQty, batchId],
    );
    return batchId;
  }

  const activeRes = await client.query<{ id: string }>(
    `SELECT id FROM inventory_batches
     WHERE product_id = $1 AND status = 'ACTIVE'
     ORDER BY received_date DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [productId],
  );

  if (activeRes.rows.length > 0) {
    const id = activeRes.rows[0].id;
    await client.query(
      `UPDATE inventory_batches
       SET remaining_quantity = remaining_quantity + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [baseQty, id],
    );
    return id;
  }

  const anyBatchRes = await client.query<{ id: string }>(
    `SELECT id FROM inventory_batches
     WHERE product_id = $1
     ORDER BY received_date DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [productId],
  );

  if (anyBatchRes.rows.length > 0) {
    const id = anyBatchRes.rows[0].id;
    await client.query(
      `UPDATE inventory_batches
       SET remaining_quantity = remaining_quantity + $1,
           status = 'ACTIVE'::batch_status,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [baseQty, id],
    );
    return id;
  }

  const ins = await client.query<{ id: string }>(
    `INSERT INTO inventory_batches (
       product_id, batch_number, quantity, remaining_quantity,
       cost_price, received_date, status, notes
     ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'ACTIVE', $6)
     RETURNING id`,
    [
      productId,
      `CN-RESTORE-${noteNumber}`,
      baseQty,
      baseQty,
      unitCost,
      `Restored from customer return ${noteNumber}`,
    ],
  );
  return ins.rows[0]?.id ?? null;
}

/**
 * Re-sync on-hand for a posted CN that already has RETURN movements (no duplicate movement rows).
 */
export async function resyncOnHandFromPostedCustomerCreditNote(
  client: PoolClient,
  params: RestoreParams,
): Promise<CustomerReturnRestoreResult> {
  const beforeQty = await readOnHand(client, params.productId);
  const resolved = await resolveReturnQuantities(client, params);
  const batchId = await applyBatchRestore(
    client,
    params.productId,
    params.noteNumber,
    resolved.batchId,
    resolved.baseQty,
    resolved.unitCost,
  );
  await syncProductQuantity(client, params.productId);
  await assertOnHandAfterCustomerReturn(
    client,
    params.productId,
    beforeQty,
    resolved.baseQty,
    params.noteNumber,
  );
  return { batchId, baseQty: resolved.baseQty, unitCost: resolved.unitCost };
}

/**
 * Increase batch stock, sync product_inventory, and record RETURN movement.
 */
export async function restoreInventoryForCustomerCreditNoteReturn(
  client: PoolClient,
  params: {
    productId: string;
    enteredQty: number;
    lineDescription: string | null;
    noteId: string;
    noteNumber: string;
    fallbackUnitCost: number;
  },
): Promise<CustomerReturnRestoreResult> {
  const beforeQty = await readOnHand(client, params.productId);
  const resolved = await resolveReturnQuantities(client, params);
  const batchId = await applyBatchRestore(
    client,
    params.productId,
    params.noteNumber,
    resolved.batchId,
    resolved.baseQty,
    resolved.unitCost,
  );

  try {
    await client.query(
      `INSERT INTO cost_layers (
         product_id, quantity, remaining_quantity, unit_cost, batch_number, created_at
       ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [params.productId, resolved.baseQty, resolved.baseQty, resolved.unitCost, `CN-${params.noteNumber}`],
    );
  } catch {
    // Non-blocking — batch + on-hand sync is authoritative for stock display
  }

  await syncProductQuantity(client, params.productId);

  await recordMovement(client, {
    productId: params.productId,
    batchId,
    movementType: 'RETURN',
    quantity: resolved.baseQty,
    unitCost: resolved.unitCost,
    referenceType: 'CREDIT_NOTE',
    referenceId: params.noteId,
    notes: `Customer return: ${params.noteNumber}`,
  });

  await assertOnHandAfterCustomerReturn(
    client,
    params.productId,
    beforeQty,
    resolved.baseQty,
    params.noteNumber,
  );

  return { batchId, baseQty: resolved.baseQty, unitCost: resolved.unitCost };
}
