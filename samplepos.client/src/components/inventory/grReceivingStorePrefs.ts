const GR_RECEIVING_STORE_KEY = 'gr.lastReceivingStoreId';

function storageKey(userId?: string): string {
  return userId ? `${GR_RECEIVING_STORE_KEY}.${userId}` : GR_RECEIVING_STORE_KEY;
}

export function readGrReceivingStoreId(userId?: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function writeGrReceivingStoreId(userId: string | undefined, storeId: string): void {
  try {
    if (!storeId) return;
    localStorage.setItem(storageKey(userId), storeId);
  } catch {
    /* ignore */
  }
}
