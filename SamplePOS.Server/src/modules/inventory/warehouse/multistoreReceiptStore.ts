/**
 * INV-POS — resolve which store receives stock when multistore is on.
 * SSOT for lotService + warehouseGrnService defaulting.
 */
import type { Pool, PoolClient } from 'pg';
import { ValidationError } from '../../../middleware/errorHandler.js';
import { storeLocationRepository } from './storeLocationRepository.js';

export type DbConn = Pool | PoolClient;

/**
 * When the operator does not pick a store, stock must land where POS sells.
 * Explicit MAIN/warehouse targets are still allowed.
 */
export async function resolveMultistoreReceiptStoreId(
  db: DbConn,
  explicitTargetStoreId: string | null | undefined,
): Promise<string> {
  await storeLocationRepository.ensureDefaultNetworkStores(db);

  if (explicitTargetStoreId) {
    const store = await storeLocationRepository.getById(db, explicitTargetStoreId);
    if (!store || !store.isActive) {
      throw new ValidationError(`Target store ${explicitTargetStoreId} is not active`);
    }
    return store.id;
  }

  const sellingStore = await storeLocationRepository.getActivePosSellingStore(db);
  if (sellingStore) {
    return sellingStore.id;
  }

  const mainStore = await storeLocationRepository.getDefaultReceivingStore(db);
  if (!mainStore) {
    throw new ValidationError(
      'Multistore GRN requires a SELLING (POS) or MAIN receiving store. Run store network setup.',
    );
  }
  return mainStore.id;
}
