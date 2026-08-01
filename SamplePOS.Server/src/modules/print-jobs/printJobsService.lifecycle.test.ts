/**
 * Behavioral proof: print job status lifecycle is enterprise-safe.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const getById = jest.fn<MockFn>();
const updateStatus = jest.fn<MockFn>();
const create = jest.fn<MockFn>();
const listPending = jest.fn<MockFn>();
const reclaimStalePrinting = jest.fn<MockFn>();
const tableReady = jest.fn<MockFn>();

jest.unstable_mockModule('./printJobsRepository.js', () => ({
  printJobsRepository: {
    getById,
    updateStatus,
    create,
    listPending,
    reclaimStalePrinting,
    createMany: jest.fn(),
  },
}));

jest.unstable_mockModule('./printJobsSchema.js', () => ({
  printJobsTableReady: tableReady,
}));

jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const { printJobsService } = await import('./printJobsService.js');

describe('printJobsService lifecycle', () => {
  const pool = {} as never;

  beforeEach(() => {
    jest.clearAllMocks();
    tableReady.mockResolvedValue(true);
  });

  it('skips enqueue when print_jobs table missing (rolling deploy)', async () => {
    tableReady.mockResolvedValue(false);
    const job = await printJobsService.enqueue(pool, {
      documentType: 'KOT',
      payloadJson: { items: [{ productName: 'X', quantity: 1 }] },
    });
    expect(job).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects payload without items[]', async () => {
    await expect(
      printJobsService.enqueue(pool, {
        documentType: 'KOT',
        payloadJson: { kotNumber: '1' },
      }),
    ).rejects.toThrow(/items/);
  });

  it('PRINTED is idempotent — no further status change', async () => {
    getById.mockResolvedValue({
      id: 'j1',
      status: 'PRINTED',
      retryCount: 0,
    });
    const out = await printJobsService.markStatus(pool, 'j1', 'ERROR', {
      errorMessage: 'late',
    });
    expect(out.status).toBe('PRINTED');
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('ERROR increments retry; PRINTING does not', async () => {
    getById.mockResolvedValue({ id: 'j1', status: 'PENDING', retryCount: 0 });
    updateStatus.mockResolvedValue({ id: 'j1', status: 'PRINTING', retryCount: 0 });

    await printJobsService.markStatus(pool, 'j1', 'PRINTING');
    expect(updateStatus).toHaveBeenCalledWith(
      pool,
      'j1',
      expect.objectContaining({ status: 'PRINTING', incrementRetry: false }),
    );

    getById.mockResolvedValue({ id: 'j1', status: 'PRINTING', retryCount: 0 });
    updateStatus.mockResolvedValue({ id: 'j1', status: 'ERROR', retryCount: 1 });
    await printJobsService.markStatus(pool, 'j1', 'ERROR', { errorMessage: 'down' });
    expect(updateStatus).toHaveBeenCalledWith(
      pool,
      'j1',
      expect.objectContaining({ status: 'ERROR', incrementRetry: true }),
    );
  });

  it('requeue resets to PENDING for reprint', async () => {
    getById.mockResolvedValue({ id: 'j1', status: 'PRINTED', retryCount: 1 });
    updateStatus.mockResolvedValue({ id: 'j1', status: 'PENDING', printedAt: null });
    const out = await printJobsService.requeue(pool, 'j1');
    expect(out.status).toBe('PENDING');
    expect(updateStatus).toHaveBeenCalledWith(
      pool,
      'j1',
      expect.objectContaining({ status: 'PENDING', clearPrintedAt: true }),
    );
  });

  it('listPending reclaims stale PRINTING first', async () => {
    reclaimStalePrinting.mockResolvedValue(2);
    listPending.mockResolvedValue([{ id: 'j1', status: 'PENDING' }]);
    const rows = await printJobsService.listPending(pool);
    expect(reclaimStalePrinting).toHaveBeenCalled();
    expect(rows).toHaveLength(1);
  });
});
