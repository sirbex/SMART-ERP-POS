/**
 * Quarantine store / lot helpers (ADR-004 Phase 2B)
 */

import type { PoolClient } from 'pg';
import type { StoreType } from '@shared/types/warehouseNetwork.js';

/** Stores that hold non-sellable stock still on GL 1300 (LQ-INV-1 / LQ-INV-4). */
export const QUARANTINE_STORE_TYPES: readonly StoreType[] = [
  'DAMAGE',
  'EXPIRED',
  'RETURN',
] as const;

export const SELLABLE_STORE_TYPES: readonly StoreType[] = ['MAIN', 'SELLING'] as const;

export function isQuarantineStoreType(storeType: string | null | undefined): boolean {
  return (QUARANTINE_STORE_TYPES as readonly string[]).includes(storeType ?? '');
}

export function isSellableStoreType(storeType: string | null | undefined): boolean {
  return (SELLABLE_STORE_TYPES as readonly string[]).includes(storeType ?? '');
}

/**
 * Sellable (MAIN/SELLING) quantity remaining for a product lot after quarantine moves.
 */
export async function getSellableQtyForProductLot(
  client: PoolClient,
  productLotId: string,
): Promise<number> {
  const result = await client.query<{ qty: string }>(
    `SELECT COALESCE(SUM(
       GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)
     ), 0)::text AS qty
     FROM inventory_balances ib
     INNER JOIN store_locations sl ON sl.id = ib.store_location_id
     WHERE ib.product_lot_id = $1
       AND NOT ib.blocked
       AND sl.store_type IN ('MAIN', 'SELLING')`,
    [productLotId],
  );
  return Number(result.rows[0]?.qty ?? 0);
}

/**
 * After a quarantine transfer: if no sellable qty remains for the lot, mark master+projection
 * QUARANTINED (DAMAGE) or leave EXPIRED (expiry automation already sets EXPIRED).
 * Partial quarantine leaves lot ACTIVE so remaining MAIN/SELLING stock stays sellable.
 */
export async function syncLotStatusAfterQuarantine(
  client: PoolClient,
  input: {
    inventoryBatchId: string | null | undefined;
    productLotId: string;
    quarantineKind: 'DAMAGE' | 'EXPIRED';
    userId: string;
  },
): Promise<{ statusApplied: string | null; sellableQtyRemaining: number }> {
  if (!input.inventoryBatchId) {
    return { statusApplied: null, sellableQtyRemaining: 0 };
  }

  const sellableQty = await getSellableQtyForProductLot(client, input.productLotId);
  if (sellableQty > 0.0001) {
    return { statusApplied: null, sellableQtyRemaining: sellableQty };
  }

  const { lotService } = await import('../inventory-lot/lotService.js');
  const newStatus = input.quarantineKind === 'EXPIRED' ? 'EXPIRED' : 'QUARANTINED';
  await lotService.transitionLotStatus(client, {
    lotId: input.inventoryBatchId,
    newStatus,
    reason:
      input.quarantineKind === 'EXPIRED'
        ? 'All sellable qty quarantined to EXPIRED store'
        : 'All sellable qty quarantined to DAMAGE store',
    userId: input.userId,
  });

  return { statusApplied: newStatus, sellableQtyRemaining: 0 };
}
