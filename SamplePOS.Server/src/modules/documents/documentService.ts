import { Pool } from 'pg';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import { DocumentRepository, Document, DocumentCreateData } from './documentRepository.js';

export interface FileUploadResult {
  document: Document;
  filePath: string;
}

export interface DocumentServiceOptions {
  uploadDir?: string;
  maxFileSize?: number;
  allowedMimeTypes?: string[];
  createThumbnails?: boolean;
}

export class DocumentService {
  private documentRepo: DocumentRepository;
  private uploadDir: string;
  private maxFileSize: number;
  private allowedMimeTypes: string[];
  private createThumbnails: boolean;

  constructor(pool: Pool, options: DocumentServiceOptions = {}) {
    this.documentRepo = new DocumentRepository(pool);
    this.uploadDir = options.uploadDir || path.join(process.cwd(), 'uploads', 'documents');
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB default
    this.allowedMimeTypes = options.allowedMimeTypes || [
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
    ];
    this.createThumbnails = options.createThumbnails || false;

    this.ensureUploadDirectory();
  }

  /**
   * Ensure upload directory exists
   */
  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      logger.info('Upload directory ensured', { uploadDir: this.uploadDir });
    } catch (error) {
      logger.error('Error creating upload directory', { error, uploadDir: this.uploadDir });
      throw new Error('Failed to create upload directory');
    }
  }

  /**
   * Validate file upload
   */
  private validateFile(file: Express.Multer.File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > this.maxFileSize) {
      return {
        valid: false,
        error: `File size ${file.size} exceeds maximum allowed size ${this.maxFileSize}`,
      };
    }

    // Check mime type
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      return {
        valid: false,
        error: `File type ${file.mimetype} is not allowed`,
      };
    }

    return { valid: true };
  }

  /**
   * Generate unique filename
   */
  private generateFilename(originalName: string): string {
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    const uuid = uuidv4();
    const timestamp = Date.now();

    // Clean filename (remove special characters)
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);

    return `${cleanName}_${timestamp}_${uuid}${ext}`;
  }

  /**
   * Get file path based on date for organization
   */
  private getOrganizedPath(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    return path.join(this.uploadDir, String(year), month);
  }

  /**
   * Upload and save document
   */
  async uploadDocument(
    file: Express.Multer.File,
    uploadedBy: string,
    options: {
      entityType?: string;
      entityId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<FileUploadResult> {
    // Validate file
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Generate paths
    const organizedDir = this.getOrganizedPath();
    const filename = this.generateFilename(file.originalname);
    const fullPath = path.join(organizedDir, filename);
    const relativePath = path.relative(this.uploadDir, fullPath);

    try {
      // Ensure directory exists
      await fs.mkdir(organizedDir, { recursive: true });

      // Save file
      await fs.writeFile(fullPath, file.buffer);

      // Create document record
      const documentData: DocumentCreateData = {
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: relativePath,
        uploadedBy,
        entityType: options.entityType,
        entityId: options.entityId,
        tags: options.tags,
        metadata: {
          ...options.metadata,
          uploadTimestamp: new Date().toISOString(),
          uploadMethod: 'direct',
        },
      };

      const document = await this.documentRepo.create(documentData);

      logger.info('Document uploaded successfully', {
        documentId: document.id,
        filename: document.filename,
        originalName: file.originalname,
        size: file.size,
      });

      return {
        document,
        filePath: fullPath,
      };
    } catch (error) {
      // Clean up file if database operation failed
      try {
        await fs.unlink(fullPath);
      } catch (unlinkError) {
        logger.warn('Failed to clean up file after error', { fullPath, unlinkError });
      }

      logger.error('Error uploading document', { error, filename: file.originalname });
      throw error;
    }
  }

  /**
   * Get document file stream
   */
  async getDocumentFile(documentId: string): Promise<{ document: Document; filePath: string }> {
    const document = await this.documentRepo.findById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    const filePath = path.join(this.uploadDir, document.path);

    try {
      await fs.access(filePath);
      return { document, filePath };
    } catch (error) {
      logger.error('Document file not found on disk', { documentId, filePath });
      throw new Error('Document file not found');
    }
  }

  /**
   * Associate document with entity
   */
  async associateWithEntity(documentId: string, entityType: string, entityId: string): Promise<boolean> {
    const document = await this.documentRepo.findById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    return await this.documentRepo.updateEntityAssociation(documentId, entityType, entityId);
  }

  /**
   * Get documents for entity
   */
  async getEntityDocuments(entityType: string, entityId: string): Promise<Document[]> {
    return await this.documentRepo.findByEntity(entityType, entityId);
  }

  /**
   * Delete document (soft delete)
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    const document = await this.documentRepo.findById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Soft delete in database
    const deleted = await this.documentRepo.softDelete(documentId);

    if (deleted) {
      // Optionally move file to archive or delete after retention period
      logger.info('Document soft deleted', { documentId, filename: document.filename });
    }

    return deleted;
  }

  /**
   * Search documents
   */
  async searchDocuments(filters: {
    entityType?: string;
    entityId?: string;
    mimeType?: string;
    tags?: string[];
    uploadedBy?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ documents: Document[]; total: number; page: number; totalPages: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const result = await this.documentRepo.search({
      ...filters,
      limit,
      offset,
    });

    const totalPages = Math.ceil(result.total / limit);

    return {
      documents: result.documents,
      total: result.total,
      page,
      totalPages,
    };
  }

  /**
   * Get document metadata
   */
  async getDocumentMetadata(documentId: string): Promise<Document | null> {
    return await this.documentRepo.findById(documentId);
  }

  /**
   * Update document metadata
   */
  async updateDocumentTags(documentId: string, tags: string[]): Promise<boolean> {
    // This would require adding an update method to the repository
    // For now, we'll implement this when needed
    throw new Error('Update tags functionality not implemented yet');
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalDocuments: number;
    totalSize: number;
    byMimeType: Record<string, { count: number; size: number }>;
    byEntityType: Record<string, { count: number; size: number }>;
  }> {
    const result = await this.documentRepo.search({ limit: 1000000 }); // Get all documents for stats

    const stats = {
      totalDocuments: result.total,
      totalSize: 0,
      byMimeType: {} as Record<string, { count: number; size: number }>,
      byEntityType: {} as Record<string, { count: number; size: number }>,
    };

    result.documents.forEach(doc => {
      stats.totalSize += doc.size;

      // By MIME type
      if (!stats.byMimeType[doc.mimeType]) {
        stats.byMimeType[doc.mimeType] = { count: 0, size: 0 };
      }
      stats.byMimeType[doc.mimeType].count++;
      stats.byMimeType[doc.mimeType].size += doc.size;

      // By entity type
      const entityType = doc.entityType || 'unassociated';
      if (!stats.byEntityType[entityType]) {
        stats.byEntityType[entityType] = { count: 0, size: 0 };
      }
      stats.byEntityType[entityType].count++;
      stats.byEntityType[entityType].size += doc.size;
    });

    return stats;
  }
}