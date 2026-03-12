/**
 * importService unit tests
 * Tests job creation, cancellation, retry, template generation, and file cleanup.
 */
import { jest } from '@jest/globals';

/** Flexible mock fn type — avoids `any` while allowing mockResolvedValue/mockReturnValue */
type MockFn = (...args: unknown[]) => Promise<unknown>;
type SyncMockFn = (...args: unknown[]) => unknown;

// ── Mock the repository ───────────────────────────────────

const mockRepo = {
  generateJobNumber: jest.fn<MockFn>(),
  createImportJob: jest.fn<MockFn>(),
  findJobById: jest.fn<MockFn>(),
  findJobByNumber: jest.fn<MockFn>(),
  listJobs: jest.fn<MockFn>(),
  getJobErrors: jest.fn<MockFn>(),
  getAllJobErrors: jest.fn<MockFn>(),
  completeImportJob: jest.fn<MockFn>(),
  atomicCancelJob: jest.fn<MockFn>(),
  getJobFilePath: jest.fn<MockFn>(),
  resetJobForRetry: jest.fn<MockFn>(),
  deleteJobErrors: jest.fn<MockFn>(),
};

jest.unstable_mockModule('./importRepository.js', () => mockRepo);

// ── Mock the job queue ────────────────────────────────────

const mockQueueRemove = jest.fn<MockFn>().mockResolvedValue(undefined);
const mockGetWaiting = jest.fn<MockFn>().mockResolvedValue([]);
const mockAddJob = jest.fn<MockFn>().mockResolvedValue({ id: 'bull-1' });

jest.unstable_mockModule('../../services/jobQueue.js', () => ({
  jobQueue: {
    addJob: mockAddJob,
    getQueue: jest.fn<SyncMockFn>().mockReturnValue({
      getWaiting: mockGetWaiting,
    }),
  },
}));

// ── Mock the schemas ──────────────────────────────────────

const mockTemplateHeaders = {
  PRODUCT: ['SKU', 'Name', 'Barcode', 'Description', 'Category', 'Generic Name',
    'Cost Price', 'Selling Price', 'Quantity On Hand', 'Batch Number', 'Expiry Date',
    'Taxable', 'Tax Rate', 'Costing Method',
    'Pricing Formula', 'Auto Update Price', 'Reorder Level', 'Track Expiry',
    'Min Days Before Expiry', 'Conversion Factor', 'Active'],
  CUSTOMER: ['Name', 'Email', 'Phone', 'Address', 'Credit Limit'],
  SUPPLIER: ['Name', 'Contact Person', 'Email', 'Phone', 'Address',
    'Payment Terms', 'Credit Limit', 'Tax Id', 'Notes'],
};

jest.unstable_mockModule('../../../../shared/zod/importSchemas.js', () => ({
  getTemplateHeaders: jest.fn<SyncMockFn>().mockImplementation(
    (entity: unknown) => mockTemplateHeaders[entity as keyof typeof mockTemplateHeaders] ?? []
  ),
}));

// ── Mock fs for cleanup ───────────────────────────────────

const mockUnlink = jest.fn<MockFn>().mockResolvedValue(undefined);
const mockAccess = jest.fn<MockFn>().mockResolvedValue(undefined);
jest.unstable_mockModule('fs/promises', () => ({
  unlink: mockUnlink,
  access: mockAccess,
}));

// ── Mock logger ───────────────────────────────────────────

jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── Import service after all mocks are set up ─────────────

const importService = await import('./importService.js');

// ── Helpers ───────────────────────────────────────────────

function makeFakeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-uuid-1',
    jobNumber: 'IMP-2025-0001',
    entityType: 'PRODUCT',
    fileName: 'products.csv',
    fileSizeBytes: 12345,
    duplicateStrategy: 'SKIP',
    status: 'PENDING',
    rowsTotal: 0,
    rowsProcessed: 0,
    rowsImported: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
    errorSummary: null,
    startedAt: null,
    completedAt: null,
    userId: 'user-1',
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────

describe('importService', () => {
  describe('createImportJob', () => {
    it('should create a job record and enqueue to Bull', async () => {
      const fakeJob = makeFakeJob();
      mockRepo.generateJobNumber.mockResolvedValue('IMP-2025-0001');
      mockRepo.createImportJob.mockResolvedValue(fakeJob);

      const result = await importService.createImportJob({
        entityType: 'PRODUCT',
        duplicateStrategy: 'SKIP',
        fileName: 'products.csv',
        filePath: '/uploads/products.csv',
        fileSizeBytes: 12345,
        userId: 'user-1',
      });

      expect(result).toEqual(fakeJob);
      expect(mockRepo.generateJobNumber).toHaveBeenCalledTimes(1);
      expect(mockRepo.createImportJob).toHaveBeenCalledTimes(1);
      expect(mockAddJob).toHaveBeenCalledWith('imports', 'csv-import', expect.objectContaining({
        jobId: 'job-uuid-1',
        entityType: 'PRODUCT',
      }));
    });

    it('should mark job FAILED if queue enqueue fails', async () => {
      const fakeJob = makeFakeJob();
      mockRepo.generateJobNumber.mockResolvedValue('IMP-2025-0001');
      mockRepo.createImportJob.mockResolvedValue(fakeJob);
      mockAddJob.mockRejectedValueOnce(new Error('Redis down'));

      await expect(
        importService.createImportJob({
          entityType: 'PRODUCT',
          duplicateStrategy: 'SKIP',
          fileName: 'products.csv',
          filePath: '/uploads/products.csv',
          fileSizeBytes: 12345,
          userId: 'user-1',
        })
      ).rejects.toThrow('Redis down');

      expect(mockRepo.completeImportJob).toHaveBeenCalledWith(
        'job-uuid-1',
        'FAILED',
        expect.stringContaining('Queue error'),
      );
    });
  });

  describe('getImportJob', () => {
    it('should look up by UUID when identifier is a UUID', async () => {
      const fakeJob = makeFakeJob({ id: '12345678-1234-5678-1234-567812345678' });
      mockRepo.findJobById.mockResolvedValue(fakeJob);

      const result = await importService.getImportJob('12345678-1234-5678-1234-567812345678');

      expect(mockRepo.findJobById).toHaveBeenCalledWith('12345678-1234-5678-1234-567812345678');
      expect(result).toEqual(fakeJob);
    });

    it('should look up by job number when identifier is not a UUID', async () => {
      const fakeJob = makeFakeJob();
      mockRepo.findJobByNumber.mockResolvedValue(fakeJob);

      const result = await importService.getImportJob('IMP-2025-0001');

      expect(mockRepo.findJobByNumber).toHaveBeenCalledWith('IMP-2025-0001');
      expect(result).toEqual(fakeJob);
    });
  });

  describe('cancelImportJob', () => {
    it('should cancel a PENDING job', async () => {
      const fakeJob = makeFakeJob({ status: 'PENDING' });
      const cancelledJob = makeFakeJob({ status: 'CANCELLED', completedAt: '2025-01-01T01:00:00Z' });
      mockRepo.findJobByNumber.mockResolvedValue(fakeJob);
      mockRepo.findJobById.mockResolvedValue(cancelledJob);
      mockRepo.atomicCancelJob.mockResolvedValue(true);
      mockGetWaiting.mockResolvedValue([]);

      const result = await importService.cancelImportJob('IMP-2025-0001');

      expect(result.status).toBe('CANCELLED');
      expect(mockRepo.atomicCancelJob).toHaveBeenCalledWith('job-uuid-1');
    });

    it('should reject cancelling a non-PENDING job', async () => {
      const fakeJob = makeFakeJob({ status: 'PROCESSING' });
      mockRepo.findJobByNumber.mockResolvedValue(fakeJob);

      await expect(
        importService.cancelImportJob('IMP-2025-0001')
      ).rejects.toThrow('Cannot cancel job in PROCESSING state');
    });

    it('should throw when job not found', async () => {
      mockRepo.findJobByNumber.mockResolvedValue(null);

      await expect(
        importService.cancelImportJob('IMP-0000-0000')
      ).rejects.toThrow('Import job not found');
    });

    it('should throw if job status changed between read and atomic cancel (race condition)', async () => {
      const fakeJob = makeFakeJob({ status: 'PENDING' });
      mockRepo.findJobByNumber.mockResolvedValue(fakeJob);
      mockRepo.atomicCancelJob.mockResolvedValue(false); // Another worker picked it up

      await expect(
        importService.cancelImportJob('IMP-2025-0001')
      ).rejects.toThrow('Job status changed');
    });
  });

  describe('retryImportJob', () => {
    it('should retry a FAILED job', async () => {
      const fakeJob = makeFakeJob({ status: 'FAILED', errorSummary: 'some error' });
      const resetJob = makeFakeJob({ status: 'PENDING', errorSummary: null, rowsProcessed: 0, rowsImported: 0, rowsSkipped: 0, rowsFailed: 0 });
      mockRepo.findJobByNumber.mockResolvedValue(fakeJob);
      mockRepo.findJobById.mockResolvedValue(resetJob);
      mockRepo.getJobFilePath.mockResolvedValue('/uploads/products.csv');
      mockRepo.resetJobForRetry.mockResolvedValue(true);
      mockRepo.deleteJobErrors.mockResolvedValue(undefined);
      mockAccess.mockResolvedValue(undefined);

      const result = await importService.retryImportJob('IMP-2025-0001');

      expect(result.status).toBe('PENDING');
      expect(result.errorSummary).toBeNull();
      expect(mockAccess).toHaveBeenCalledWith('/uploads/products.csv');
      expect(mockRepo.resetJobForRetry).toHaveBeenCalledWith('job-uuid-1');
      expect(mockRepo.deleteJobErrors).toHaveBeenCalledWith('job-uuid-1');
      expect(mockAddJob).toHaveBeenCalledWith('imports', 'csv-import', expect.objectContaining({
        jobId: 'job-uuid-1',
      }));
    });

    it('should reject retrying a non-FAILED job', async () => {
      const fakeJob = makeFakeJob({ status: 'COMPLETED' });
      mockRepo.findJobByNumber.mockResolvedValue(fakeJob);

      await expect(
        importService.retryImportJob('IMP-2025-0001')
      ).rejects.toThrow('Cannot retry job in COMPLETED state');
    });

    it('should fail if file was cleaned up', async () => {
      const fakeJob = makeFakeJob({ status: 'FAILED' });
      mockRepo.findJobByNumber.mockResolvedValue(fakeJob);
      mockRepo.getJobFilePath.mockResolvedValue(null);

      await expect(
        importService.retryImportJob('IMP-2025-0001')
      ).rejects.toThrow('CSV file path not found');
    });

    it('should fail if file no longer exists on disk', async () => {
      const fakeJob = makeFakeJob({ status: 'FAILED' });
      mockRepo.findJobByNumber.mockResolvedValue(fakeJob);
      mockRepo.getJobFilePath.mockResolvedValue('/uploads/products.csv');
      mockAccess.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(
        importService.retryImportJob('IMP-2025-0001')
      ).rejects.toThrow('CSV file no longer exists on disk');
    });

    it('should throw if another retry already changed the status (race condition)', async () => {
      const fakeJob = makeFakeJob({ status: 'FAILED' });
      mockRepo.findJobByNumber.mockResolvedValue(fakeJob);
      mockRepo.getJobFilePath.mockResolvedValue('/uploads/products.csv');
      mockAccess.mockResolvedValue(undefined);
      mockRepo.resetJobForRetry.mockResolvedValue(false); // Race: already retried

      await expect(
        importService.retryImportJob('IMP-2025-0001')
      ).rejects.toThrow('Job status changed');
    });
  });

  describe('generateCsvTemplate', () => {
    it('should return headers for PRODUCT entity', () => {
      const result = importService.generateCsvTemplate('PRODUCT');

      expect(result.filename).toBe('product-template.csv');
      expect(result.headers).toContain('SKU');
      expect(result.headers).toContain('Name');
      expect(result.headers).toContain('Cost Price');
      expect(result.headers).toContain('Selling Price');
      expect(result.headers).toContain('Batch Number');
      expect(result.headers).toContain('Expiry Date');
      expect(result.headers.length).toBe(21);
    });

    it('should return headers for CUSTOMER entity', () => {
      const result = importService.generateCsvTemplate('CUSTOMER');

      expect(result.filename).toBe('customer-template.csv');
      expect(result.headers).toContain('Name');
      expect(result.headers).toContain('Email');
      expect(result.headers.length).toBe(5);
    });

    it('should return headers for SUPPLIER entity', () => {
      const result = importService.generateCsvTemplate('SUPPLIER');

      expect(result.filename).toBe('supplier-template.csv');
      expect(result.headers).toContain('Name');
      expect(result.headers).toContain('Contact Person');
      expect(result.headers.length).toBe(9);
    });
  });

  describe('cleanupJobFile', () => {
    it('should delete the file on disk', async () => {
      mockRepo.getJobFilePath.mockResolvedValue('/uploads/products.csv');
      // access rejects for xlsx/xls variants (they don't exist)
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      await importService.cleanupJobFile('job-uuid-1');

      expect(mockUnlink).toHaveBeenCalledWith('/uploads/products.csv');
    });

    it('should do nothing if no file path found', async () => {
      mockRepo.getJobFilePath.mockResolvedValue(null);

      await importService.cleanupJobFile('job-uuid-1');

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should not throw if unlink fails', async () => {
      mockRepo.getJobFilePath.mockResolvedValue('/uploads/gone.csv');
      mockUnlink.mockRejectedValueOnce(new Error('ENOENT'));
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      // Should not throw
      await importService.cleanupJobFile('job-uuid-1');
    });

    it('should also clean up original xlsx file after Excel conversion', async () => {
      mockRepo.getJobFilePath.mockResolvedValue('/uploads/data.csv');
      mockUnlink.mockResolvedValue(undefined);
      // access succeeds for .xlsx (it exists), fails for .xls
      mockAccess
        .mockResolvedValueOnce(undefined)   // /uploads/data.xlsx exists
        .mockRejectedValueOnce(new Error('ENOENT'));  // /uploads/data.xls doesn't exist

      await importService.cleanupJobFile('job-uuid-1');

      expect(mockUnlink).toHaveBeenCalledWith('/uploads/data.csv');
      expect(mockUnlink).toHaveBeenCalledWith('/uploads/data.xlsx');
      expect(mockUnlink).not.toHaveBeenCalledWith('/uploads/data.xls');
    });
  });

  describe('listImportJobs', () => {
    it('should pass filters to repository', async () => {
      mockRepo.listJobs.mockResolvedValue({ rows: [], total: 0 });

      await importService.listImportJobs({ entityType: 'PRODUCT', limit: 10, offset: 0 });

      expect(mockRepo.listJobs).toHaveBeenCalledWith({
        entityType: 'PRODUCT',
        limit: 10,
        offset: 0,
      });
    });
  });

  describe('getImportJobErrors', () => {
    it('should return paginated errors', async () => {
      mockRepo.getJobErrors.mockResolvedValue({ rows: [], total: 0 });

      const result = await importService.getImportJobErrors('job-uuid-1', 50, 0);

      expect(mockRepo.getJobErrors).toHaveBeenCalledWith('job-uuid-1', 50, 0);
      expect(result).toEqual({ rows: [], total: 0 });
    });
  });
});
