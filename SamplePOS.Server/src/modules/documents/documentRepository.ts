import { Pool } from 'pg';
import logger from '../../utils/logger.js';

export interface Document {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  entityType?: string;  // 'EXPENSE', 'INVOICE', 'JOURNAL', 'PURCHASE_ORDER'
  entityId?: string;
  uploadedBy: string;
  uploadedAt: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  isActive: boolean;
}

export interface DocumentCreateData {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  entityType?: string;
  entityId?: string;
  uploadedBy: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export class DocumentRepository {
  constructor(private pool: Pool) { }

  /**
   * Create a new document record
   */
  async create(data: DocumentCreateData): Promise<Document> {
    const query = `
      INSERT INTO documents (
        id, filename, original_name, mime_type, size, path, 
        entity_type, entity_id, uploaded_by, tags, metadata, is_active, created_at
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW()
      )
      RETURNING 
        id, filename, original_name as "originalName", mime_type as "mimeType", 
        size, path, entity_type as "entityType", entity_id as "entityId", 
        uploaded_by as "uploadedBy", created_at as "uploadedAt", tags, metadata, is_active as "isActive"
    `;

    try {
      const result = await this.pool.query(query, [
        data.filename,
        data.originalName,
        data.mimeType,
        data.size,
        data.path,
        data.entityType || null,
        data.entityId || null,
        data.uploadedBy,
        JSON.stringify(data.tags || []),
        JSON.stringify(data.metadata || {}),
      ]);

      const document = result.rows[0];
      document.tags = JSON.parse(document.tags || '[]');
      document.metadata = JSON.parse(document.metadata || '{}');

      logger.info('Document created successfully', { documentId: document.id, filename: data.filename });
      return document;
    } catch (error) {
      logger.error('Error creating document', { error, data });
      throw error;
    }
  }

  /**
   * Get document by ID
   */
  async findById(id: string): Promise<Document | null> {
    const query = `
      SELECT 
        id, filename, original_name as "originalName", mime_type as "mimeType", 
        size, path, entity_type as "entityType", entity_id as "entityId", 
        uploaded_by as "uploadedBy", created_at as "uploadedAt", tags, metadata, is_active as "isActive"
      FROM documents 
      WHERE id = $1 AND is_active = true
    `;

    try {
      const result = await this.pool.query(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const document = result.rows[0];
      document.tags = JSON.parse(document.tags || '[]');
      document.metadata = JSON.parse(document.metadata || '{}');

      return document;
    } catch (error) {
      logger.error('Error finding document by ID', { error, id });
      throw error;
    }
  }

  /**
   * Get documents by entity
   */
  async findByEntity(entityType: string, entityId: string): Promise<Document[]> {
    const query = `
      SELECT 
        id, filename, original_name as "originalName", mime_type as "mimeType", 
        size, path, entity_type as "entityType", entity_id as "entityId", 
        uploaded_by as "uploadedBy", created_at as "uploadedAt", tags, metadata, is_active as "isActive"
      FROM documents 
      WHERE entity_type = $1 AND entity_id = $2 AND is_active = true
      ORDER BY created_at DESC
    `;

    try {
      const result = await this.pool.query(query, [entityType, entityId]);

      return result.rows.map(doc => ({
        ...doc,
        tags: JSON.parse(doc.tags || '[]'),
        metadata: JSON.parse(doc.metadata || '{}'),
      }));
    } catch (error) {
      logger.error('Error finding documents by entity', { error, entityType, entityId });
      throw error;
    }
  }

  /**
   * Update document entity association
   */
  async updateEntityAssociation(id: string, entityType: string, entityId: string): Promise<boolean> {
    const query = `
      UPDATE documents 
      SET entity_type = $1, entity_id = $2, updated_at = NOW()
      WHERE id = $3 AND is_active = true
    `;

    try {
      const result = await this.pool.query(query, [entityType, entityId, id]);
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error('Error updating document entity association', { error, id, entityType, entityId });
      throw error;
    }
  }

  /**
   * Soft delete document
   */
  async softDelete(id: string): Promise<boolean> {
    const query = `
      UPDATE documents 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
    `;

    try {
      const result = await this.pool.query(query, [id]);
      logger.info('Document soft deleted', { documentId: id });
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error('Error soft deleting document', { error, id });
      throw error;
    }
  }

  /**
   * Search documents with filters
   */
  async search(filters: {
    entityType?: string;
    entityId?: string;
    mimeType?: string;
    tags?: string[];
    uploadedBy?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ documents: Document[]; total: number }> {
    let whereConditions = ['is_active = true'];
    const queryParams: unknown[] = [];
    let paramCount = 0;

    if (filters.entityType) {
      whereConditions.push(`entity_type = $${++paramCount}`);
      queryParams.push(filters.entityType);
    }

    if (filters.entityId) {
      whereConditions.push(`entity_id = $${++paramCount}`);
      queryParams.push(filters.entityId);
    }

    if (filters.mimeType) {
      whereConditions.push(`mime_type = $${++paramCount}`);
      queryParams.push(filters.mimeType);
    }

    if (filters.uploadedBy) {
      whereConditions.push(`uploaded_by = $${++paramCount}`);
      queryParams.push(filters.uploadedBy);
    }

    if (filters.fromDate) {
      whereConditions.push(`created_at >= $${++paramCount}`);
      queryParams.push(filters.fromDate);
    }

    if (filters.toDate) {
      whereConditions.push(`created_at <= $${++paramCount}`);
      queryParams.push(filters.toDate);
    }

    if (filters.search) {
      whereConditions.push(`(original_name ILIKE $${++paramCount} OR filename ILIKE $${++paramCount})`);
      queryParams.push(`%${filters.search}%`, `%${filters.search}%`);
      paramCount++;
    }

    if (filters.tags && filters.tags.length > 0) {
      const tagConditions = filters.tags.map(() => `tags::jsonb ? $${++paramCount}`);
      whereConditions.push(`(${tagConditions.join(' OR ')})`);
      queryParams.push(...filters.tags);
    }

    const whereClause = whereConditions.join(' AND ');
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    // Count query
    const countQuery = `SELECT COUNT(*) FROM documents WHERE ${whereClause}`;

    // Data query
    const dataQuery = `
      SELECT 
        id, filename, original_name as "originalName", mime_type as "mimeType", 
        size, path, entity_type as "entityType", entity_id as "entityId", 
        uploaded_by as "uploadedBy", created_at as "uploadedAt", tags, metadata, is_active as "isActive"
      FROM documents 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;

    queryParams.push(limit, offset);

    try {
      const [countResult, dataResult] = await Promise.all([
        this.pool.query(countQuery, queryParams.slice(0, -2)),
        this.pool.query(dataQuery, queryParams),
      ]);

      const documents = dataResult.rows.map(doc => ({
        ...doc,
        tags: JSON.parse(doc.tags || '[]'),
        metadata: JSON.parse(doc.metadata || '{}'),
      }));

      return {
        documents,
        total: parseInt(countResult.rows[0].count),
      };
    } catch (error) {
      logger.error('Error searching documents', { error, filters });
      throw error;
    }
  }
}