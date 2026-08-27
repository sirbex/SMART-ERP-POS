/**
 * Unit: resolveMultistoreReceiptStoreId decision table (real function).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureDefaultNetworkStores: vi.fn(async () => undefined),
  getById: vi.fn(),
  getActivePosSellingStore: vi.fn(),
  getDefaultReceivingStore: vi.fn(),
}));

vi.mock('./storeLocationRepository.js', () => ({
  storeLocationRepository: {
    ensureDefaultNetworkStores: mocks.ensureDefaultNetworkStores,
    getById: mocks.getById,
    getActivePosSellingStore: mocks.getActivePosSellingStore,
    getDefaultReceivingStore: mocks.getDefaultReceivingStore,
  },
}));

import { resolveMultistoreReceiptStoreId } from './multistoreReceiptStore.js';

describe('resolveMultistoreReceiptStoreId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers SELLING when target is null', async () => {
    mocks.getActivePosSellingStore.mockResolvedValue({ id: 'sell-1' });
    mocks.getDefaultReceivingStore.mockResolvedValue({ id: 'main-1' });
    await expect(resolveMultistoreReceiptStoreId({} as never, null)).resolves.toBe('sell-1');
    expect(mocks.getDefaultReceivingStore).not.toHaveBeenCalled();
  });

  it('falls back to MAIN when no SELLING', async () => {
    mocks.getActivePosSellingStore.mockResolvedValue(null);
    mocks.getDefaultReceivingStore.mockResolvedValue({ id: 'main-1' });
    await expect(resolveMultistoreReceiptStoreId({} as never, null)).resolves.toBe('main-1');
  });

  it('honors explicit active store (including MAIN)', async () => {
    mocks.getById.mockResolvedValue({ id: 'main-1', isActive: true });
    await expect(resolveMultistoreReceiptStoreId({} as never, 'main-1')).resolves.toBe('main-1');
    expect(mocks.getActivePosSellingStore).not.toHaveBeenCalled();
  });

  it('rejects inactive explicit store', async () => {
    mocks.getById.mockResolvedValue({ id: 'main-1', isActive: false });
    await expect(resolveMultistoreReceiptStoreId({} as never, 'main-1')).rejects.toThrow(
      /not active/,
    );
  });
});
