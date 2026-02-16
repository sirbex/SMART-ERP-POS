import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { DocumentService } from './documentService.js';
import { authenticate } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';
import { pool as globalPool } from '../../db/pool.js';

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
  metadata: z.record(z.any()).optional(),
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
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided',
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    // Parse and validate request body
    let uploadData = {};
    if (req.body.data) {
      try {
        uploadData = JSON.parse(req.body.data);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON in data field',
        });
      }
    }

    const validatedData = UploadDocumentSchema.parse(uploadData);

    // Upload document
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
  } catch (error) {
    logger.error('Error uploading document', { error, userId: req.user?.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * Get document file
 * GET /api/documents/:id/file
 */
router.get('/:id/file', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid document ID',
      });
    }

    const { document, filePath } = await getDocumentService(req).getDocumentFile(id);

    // Set appropriate headers
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Length', document.size);
    res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);

    // Stream file
    res.sendFile(filePath);
  } catch (error) {
    logger.error('Error serving document file', { error, documentId: req.params.id });

    if (error instanceof Error && error.message === 'Document not found') {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to serve document file',
    });
  }
});

/**
 * Get document metadata
 * GET /api/documents/:id
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid document ID',
      });
    }

    const document = await getDocumentService(req).getDocumentMetadata(id);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    logger.error('Error getting document metadata', { error, documentId: req.params.id });

    res.status(500).json({
      success: false,
      error: 'Failed to get document metadata',
    });
  }
});

/**
 * Search documents
 * GET /api/documents
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const validatedQuery = SearchDocumentsSchema.parse(req.query);

    // Convert string parameters to appropriate types
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
  } catch (error) {
    logger.error('Error searching documents', { error, query: req.query });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to search documents',
    });
  }
});

/**
 * Associate document with entity
 * PUT /api/documents/:id/associate
 */
router.put('/:id/associate', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid document ID',
      });
    }

    const validatedData = AssociateDocumentSchema.parse(req.body);

    const success = await getDocumentService(req).associateWithEntity(
      id,
      validatedData.entityType,
      validatedData.entityId
    );

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    logger.info('Document associated with entity', {
      documentId: id,
      entityType: validatedData.entityType,
      entityId: validatedData.entityId,
    });

    res.json({
      success: true,
      message: 'Document associated successfully',
    });
  } catch (error) {
    logger.error('Error associating document', { error, documentId: req.params.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to associate document',
    });
  }
});

/**
 * Get entity documents
 * GET /api/documents/entity/:entityType/:entityId
 */
router.get('/entity/:entityType/:entityId', authenticate, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    // Validate entity type
    const validEntityTypes = ['EXPENSE', 'INVOICE', 'JOURNAL', 'PURCHASE_ORDER', 'SALE'];
    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid entity type',
      });
    }

    if (!entityId || typeof entityId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid entity ID',
      });
    }

    const documents = await getDocumentService(req).getEntityDocuments(entityType, entityId);

    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    logger.error('Error getting entity documents', { error, params: req.params });

    res.status(500).json({
      success: false,
      error: 'Failed to get entity documents',
    });
  }
});

/**
 * Delete document
 * DELETE /api/documents/:id
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid document ID',
      });
    }

    const success = await getDocumentService(req).deleteDocument(id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    logger.info('Document deleted', { documentId: id, userId: req.user?.id });

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting document', { error, documentId: req.params.id });

    res.status(500).json({
      success: false,
      error: 'Failed to delete document',
    });
  }
});

/**
 * Get storage statistics
 * GET /api/documents/stats/storage
 */
router.get('/stats/storage', authenticate, async (req, res) => {
  try {
    const stats = await getDocumentService(req).getStorageStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting storage stats', { error });

    res.status(500).json({
      success: false,
      error: 'Failed to get storage statistics',
    });
  }
});

export default router;