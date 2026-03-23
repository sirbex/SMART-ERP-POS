/**
 * Import Controller - HTTP handlers for CSV bulk import
 *
 * ARCHITECTURE: Controller layer — validation, file handling, response formatting.
 * File upload: Multer disk storage → Bull queue → background worker.
 *
 * Endpoints:
 *   POST   /upload          Upload CSV and start import job
 *   GET    /jobs             List import jobs (paginated)
 *   GET    /jobs/:id         Get single job status
 *   GET    /jobs/:id/errors  Get job errors (paginated)
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { read, utils } from 'xlsx';
import logger from '../../utils/logger.js';
import * as importService from './importService.js';
import { ImportUploadSchema } from '../../../../shared/zod/importSchemas.js';
import { asyncHandler, ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import { pool as globalPool } from '../../db/pool.js';
import type { TenantPoolConfig } from '../../db/connectionManager.js';

// ── Multer disk storage (CSV only, 100 MB limit) ─────────

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'imports');

// Ensure directory exists at startup
try {
  mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (err) {
  logger.error('Failed to create import uploads directory — uploads may fail', {
    path: UPLOAD_DIR,
    error: err instanceof Error ? err.message : String(err),
  });
}

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueSuffix}-${sanitized}`);
  },
});

const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);
const ALLOWED_MIMETYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const csvFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext) || ALLOWED_MIMETYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV, XLSX, and XLS files are allowed'));
  }
};

export const uploadCsv = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: csvFileFilter,
}).single('file');

// ── Query schemas ─────────────────────────────────────────

const JobListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  entityType: z.enum(['PRODUCT', 'CUSTOMER', 'SUPPLIER']).optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
});

const JobErrorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const JobIdParamSchema = z.object({
  id: z.string().min(1),
});

// ── Controllers ───────────────────────────────────────────

/**
 * POST /upload — Upload CSV and start an import job
 */
/**
 * If the uploaded file is XLSX/XLS, convert the first sheet to CSV
 * and return the new CSV path. For CSV files, returns the original path unchanged.
 */
function convertExcelToCsvIfNeeded(filePath: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  if (ext !== '.xlsx' && ext !== '.xls') return filePath;

  try {
    const workbook = read(filePath, { type: 'file' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new ValidationError('Excel file has no sheets');

    const csv = utils.sheet_to_csv(workbook.Sheets[sheetName]);
    const csvPath = filePath.replace(/\.(xlsx|xls)$/i, '.csv');
    writeFileSync(csvPath, csv, 'utf-8');

    logger.info('Converted Excel to CSV', { original: originalName, csvPath });
    return csvPath;
  } catch (error: unknown) {
    // Re-throw our own ValidationErrors as-is
    if (error instanceof ValidationError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    throw new ValidationError(
      `Failed to read Excel file — file may be corrupt or password-protected: ${msg}`
    );
  }
}

export const uploadAndStartImport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError('No file uploaded. Field name must be "file".');
  }

  const pool = req.tenantPool || globalPool;
  const tenantPoolConfig: TenantPoolConfig | undefined = req.tenant
    ? {
      tenantId: req.tenant.id,
      slug: req.tenant.slug,
      databaseName: req.tenant.databaseName,
      databaseHost: req.tenant.databaseHost,
      databasePort: req.tenant.databasePort,
    }
    : undefined;

  // Validate body params (entityType, duplicateStrategy)
  const bodyResult = ImportUploadSchema.safeParse(req.body);
  if (!bodyResult.success) {
    const errors = bodyResult.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new ValidationError(errors);
  }

  const { entityType, duplicateStrategy } = bodyResult.data;
  const userId = req.user!.id;

  // Convert XLSX/XLS → CSV before passing to worker pipeline
  const csvPath = convertExcelToCsvIfNeeded(req.file.path, req.file.originalname);

  logger.info('Import upload received', {
    entityType,
    duplicateStrategy,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    userId,
    converted: csvPath !== req.file.path,
  });

  const job = await importService.createImportJob(
    {
      entityType,
      duplicateStrategy,
      fileName: req.file.originalname,
      filePath: csvPath,
      fileSizeBytes: req.file.size,
      userId,
      tenantPoolConfig,
    },
    pool
  );

  res.status(201).json({
    success: true,
    data: {
      jobId: job.id,
      jobNumber: job.jobNumber,
      status: job.status,
      message: `Import job queued. Track progress at GET /api/import/jobs/${job.jobNumber}`,
    },
  });
});

/**
 * GET /jobs — List import jobs (paginated)
 */
export const listImportJobs = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const query = JobListQuerySchema.parse(req.query);
  const offset = (query.page - 1) * query.limit;
  const result = await importService.listImportJobs(
    {
      entityType: query.entityType,
      status: query.status,
      limit: query.limit,
      offset,
    },
    pool
  );

  res.json({
    success: true,
    data: {
      ...result,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
});

/**
 * GET /jobs/:id — Get single import job by ID or job number
 */
export const getImportJob = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = JobIdParamSchema.parse(req.params);
  const job = await importService.getImportJob(id, pool);
  if (!job) {
    throw new NotFoundError(`Import job not found: ${id}`);
  }

  res.json({
    success: true,
    data: job,
  });
});

/**
 * GET /jobs/:id/errors — Get errors for an import job (paginated)
 */
export const getImportJobErrors = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = JobIdParamSchema.parse(req.params);
  const query = JobErrorsQuerySchema.parse(req.query);

  // Resolve to UUID if job number was passed
  const job = await importService.getImportJob(id, pool);
  if (!job) {
    throw new NotFoundError(`Import job not found: ${id}`);
  }

  const offset = (query.page - 1) * query.limit;
  const result = await importService.getImportJobErrors(job.id, query.limit, offset, pool);

  res.json({
    success: true,
    data: {
      ...result,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
});

/**
 * GET /jobs/:id/errors/csv — Download all errors as CSV (streamed for large sets)
 */
export const exportErrorsCsv = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = JobIdParamSchema.parse(req.params);

  const job = await importService.getImportJob(id, pool);
  if (!job) {
    throw new NotFoundError(`Import job not found: ${id}`);
  }

  const filename = `import-errors-${job.jobNumber}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Write header
  res.write('Row Number,Error Type,Error Message,Raw Data\n');

  // Stream errors in pages to avoid loading all into memory
  const PAGE_SIZE = 2000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { rows } = await importService.getImportJobErrors(job.id, PAGE_SIZE, offset, pool);
    for (const err of rows) {
      const rawData = err.rawData ? JSON.stringify(err.rawData).replace(/"/g, '""') : '';
      // Strip newlines/carriage returns from error messages to prevent broken CSV rows
      const safeMessage = err.errorMessage.replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
      const safeRawData = rawData.replace(/[\r\n]+/g, ' ');
      res.write(
        [String(err.rowNumber), err.errorType, `"${safeMessage}"`, `"${safeRawData}"`].join(',') +
        '\n'
      );
    }
    offset += PAGE_SIZE;
    hasMore = rows.length === PAGE_SIZE;
  }

  res.end();
});

// ── Cancel / Retry / Template ─────────────────────────────

const EntityTypeParamSchema = z.object({
  entityType: z.enum(['PRODUCT', 'CUSTOMER', 'SUPPLIER']),
});

/**
 * POST /jobs/:id/cancel — Cancel a PENDING import job
 */
export const cancelImportJob = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = JobIdParamSchema.parse(req.params);
  const job = await importService.cancelImportJob(id, pool);

  res.json({
    success: true,
    data: job,
    message: 'Import job cancelled',
  });
});

/**
 * POST /jobs/:id/retry — Retry a FAILED import job
 */
export const retryImportJob = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const tenantPoolConfig: TenantPoolConfig | undefined = req.tenant
    ? {
      tenantId: req.tenant.id,
      slug: req.tenant.slug,
      databaseName: req.tenant.databaseName,
      databaseHost: req.tenant.databaseHost,
      databasePort: req.tenant.databasePort,
    }
    : undefined;
  const { id } = JobIdParamSchema.parse(req.params);
  const job = await importService.retryImportJob(id, tenantPoolConfig, pool);

  res.json({
    success: true,
    data: job,
    message: 'Import job re-queued for retry',
  });
});

/**
 * GET /template/:entityType — Download CSV template for entity
 */
export const downloadTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { entityType } = EntityTypeParamSchema.parse(req.params);
  const { headers, instructionsRow, sampleRow, filename } = importService.generateCsvTemplate(entityType);

  // Escape CSV fields that may contain commas or parentheses
  const escapeCsv = (val: string) => val.includes(',') || val.includes('(') ? `"${val}"` : val;

  const lines = [
    headers.join(','),
    instructionsRow.map(escapeCsv).join(','),
    sampleRow.map(escapeCsv).join(','),
  ];

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\n') + '\n');
});
