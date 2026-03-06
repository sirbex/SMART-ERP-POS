import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { DocumentService } from './documentService.js';
import { authenticate } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';
import { pool as globalPool } from '../../db/pool.js';
import { asyncHandler, NotFoundError, ValidationError, UnauthorizedError } from '../../middleware/errorHandler.js';

const router = express.Router();

// Document service options (shared across all instances)
const documentServiceOptions = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
};

/**
 * Get a DocumentService instance for the current request's pool
 */
function getDocumentService(req: express.Request): DocumentService {
  const pool = req.tenantPool || globalPool;
  return new DocumentService(pool, documentServiceOptions);
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Validation schemas
const UploadDocumentSchema = z.object({
  entityType: z.enum(['EXPENSE', 'INVOICE', 'JOURNAL', 'PURCHASE_ORDER', 'SALE']).optional(),
  entityId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const SearchDocumentsSchema = z.object({
  entityType: z.enum(['EXPENSE', 'INVOICE', 'JOURNAL', 'PURCHASE_ORDER', 'SALE']).optional(),
  entityId: z.string().uuid().optional(),
  mimeType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  uploadedBy: z.string().uuid().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const AssociateDocumentSchema = z.object({
  entityType: z.enum(['EXPENSE', 'INVOICE', 'JOURNAL', 'PURCHASE_ORDER', 'SALE']),
  entityId: z.string().uuid(),
});

/**
 * Upload document
 * POST /api/documents/upload
 */
router.post('/upload', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ValidationError('No file provided');
  if (!req.user?.id) throw new UnauthorizedError('User not authenticated');

  // Parse and validate request body
  let uploadData = {};
  if (req.body.data) {
    try {
      uploadData = JSON.parse(req.body.data);
    } catch {
      throw new ValidationError('Invalid JSON in data field');
    }
  }

  const validatedData = UploadDocumentSchema.parse(uploadData);

  const result = await getDocumentService(req).uploadDocument(req.file, req.user.id, {
    entityType: validatedData.entityType,
    entityId: validatedData.entityId,
    tags: validatedData.tags,
    metadata: validatedData.metadata,
  });

  logger.info('Document uploaded via API', {
    documentId: result.document.id,
    filename: result.document.filename,
    userId: req.user.id,
  });

  res.json({
    success: true,
    data: result.document,
  });
}));

/**
 * Get document file
 * GET /api/documents/:id/file
 */
router.get('/:id/file', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string') throw new ValidationError('Invalid document ID');

  const { document, filePath } = await getDocumentService(req).getDocumentFile(id);

  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Length', document.size);
  res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);

  res.sendFile(filePath);
}));

/**
 * Get document metadata
 * GET /api/documents/:id
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string') throw new ValidationError('Invalid document ID');

  const document = await getDocumentService(req).getDocumentMetadata(id);
  if (!document) throw new NotFoundError('Document');

  res.json({
    success: true,
    data: document,
  });
}));

/**
 * Search documents
 * GET /api/documents
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const validatedQuery = SearchDocumentsSchema.parse(req.query);

  const filters = {
    ...validatedQuery,
    tags: validatedQuery.tags || (req.query.tags as string)?.split(',').filter(Boolean),
    page: validatedQuery.page ? parseInt(validatedQuery.page) : 1,
    limit: validatedQuery.limit ? parseInt(validatedQuery.limit) : 20,
  };

  const result = await getDocumentService(req).searchDocuments(filters);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * Associate document with entity
 * PUT /api/documents/:id/associate
 */
router.put('/:id/associate', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string') throw new ValidationError('Invalid document ID');

  const validatedData = AssociateDocumentSchema.parse(req.body);

  const success = await getDocumentService(req).associateWithEntity(
    id,
    validatedData.entityType,
    validatedData.entityId
  );

  if (!success) throw new NotFoundError('Document');

  logger.info('Document associated with entity', {
    documentId: id,
    entityType: validatedData.entityType,
    entityId: validatedData.entityId,
  });

  res.json({
    success: true,
    message: 'Document associated successfully',
  });
}));

/**
 * Get entity documents
 * GET /api/documents/entity/:entityType/:entityId
 */
router.get('/entity/:entityType/:entityId', authenticate, asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.params;

  const validEntityTypes = ['EXPENSE', 'INVOICE', 'JOURNAL', 'PURCHASE_ORDER', 'SALE'];
  if (!validEntityTypes.includes(entityType)) throw new ValidationError('Invalid entity type');
  if (!entityId || typeof entityId !== 'string') throw new ValidationError('Invalid entity ID');

  const documents = await getDocumentService(req).getEntityDocuments(entityType, entityId);

  res.json({
    success: true,
    data: documents,
  });
}));

/**
 * Delete document
 * DELETE /api/documents/:id
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string') throw new ValidationError('Invalid document ID');

  const success = await getDocumentService(req).deleteDocument(id);
  if (!success) throw new NotFoundError('Document');

  logger.info('Document deleted', { documentId: id, userId: req.user?.id });

  res.json({
    success: true,
    message: 'Document deleted successfully',
  });
}));

/**
 * Get storage statistics
 * GET /api/documents/stats/storage
 */
router.get('/stats/storage', authenticate, asyncHandler(async (_req, res) => {
  const stats = await getDocumentService(_req).getStorageStats();

  res.json({
    success: true,
    data: stats,
  });
}));

export default router;