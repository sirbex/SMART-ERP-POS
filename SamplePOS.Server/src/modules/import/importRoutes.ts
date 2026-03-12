/**
 * Import Routes - CSV bulk import endpoints
 *
 * Multer middleware runs first (parses multipart form), then auth + RBAC.
 * Upload requires inventory.create (products), system.users_create (customers/suppliers)
 * or a dedicated import permission if one is added later.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import * as importController from './importController.js';
import { uploadCsv } from './importController.js';

const router = Router();

// All import routes require authentication + inventory.import permission
router.use(authenticate);
router.use(requirePermission('inventory.import'));

// POST /upload — Upload CSV and start import
// Multer parses multipart body before the handler runs.
// We use a wrapper to convert multer errors into proper JSON responses.
router.post(
  '/upload',
  (req: Request, res: Response, next: NextFunction) => {
    uploadCsv(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : 'File upload failed';
        res.status(400).json({ success: false, error: message });
        return;
      }
      next();
    });
  },
  importController.uploadAndStartImport,
);

// GET /jobs — List import jobs
router.get('/jobs', importController.listImportJobs);

// GET /jobs/:id — Single job status
router.get('/jobs/:id', importController.getImportJob);

// GET /jobs/:id/errors — Job errors (paginated)
router.get('/jobs/:id/errors', importController.getImportJobErrors);

// GET /jobs/:id/errors/csv — Download errors as CSV
router.get('/jobs/:id/errors/csv', importController.exportErrorsCsv);

// POST /jobs/:id/cancel — Cancel a PENDING job
router.post('/jobs/:id/cancel', importController.cancelImportJob);

// POST /jobs/:id/retry — Retry a FAILED job
router.post('/jobs/:id/retry', importController.retryImportJob);

// GET /template/:entityType — Download CSV template
router.get('/template/:entityType', importController.downloadTemplate);

export const importRoutes = router;
