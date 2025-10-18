import { query, getClient } from '../db/pool';
import { logger } from '../utils/logger';
import { InventoryItem } from '../models/inventory-item';
import { DbResult, QueryOptions } from '../types/database';
import { v4 as uuidv4 } from 'uuid';

/**
 * Repository for inventory item operations
 */
export class InventoryItemRepository {
  /**
   * Find all inventory items with optional filtering and pagination
   */
  async findAll(options?: QueryOptions): Promise<DbResult<InventoryItem[]>> {
    try {
      // Build the query based on options
      let queryText = `
        SELECT i.*,
          COALESCE(SUM(b.remaining_quantity), 0) as quantity
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
        WHERE i.is_active = true
      `;

      const queryParams: any[] = [];
      let paramCounter = 1;

      // Apply filters if provided
      if (options?.filters && options.filters.length > 0) {
        options.filters.forEach(filter => {
          let condition: string;
          
          switch (filter.operator) {
            case 'eq':
              condition = `i."${filter.field}" = $${paramCounter++}`;
              queryParams.push(filter.value);
              break;
            case 'neq':
              condition = `i."${filter.field}" != $${paramCounter++}`;
              queryParams.push(filter.value);
              break;
            case 'gt':
              condition = `i."${filter.field}" > $${paramCounter++}`;
              queryParams.push(filter.value);
              break;
            case 'gte':
              condition = `i."${filter.field}" >= $${paramCounter++}`;
              queryParams.push(filter.value);
              break;
            case 'lt':
              condition = `i."${filter.field}" < $${paramCounter++}`;
              queryParams.push(filter.value);
              break;
            case 'lte':
              condition = `i."${filter.field}" <= $${paramCounter++}`;
              queryParams.push(filter.value);
              break;
            case 'like':
              condition = `i."${filter.field}" LIKE $${paramCounter++}`;
              queryParams.push(`%${filter.value}%`);
              break;
            case 'ilike':
              condition = `i."${filter.field}" ILIKE $${paramCounter++}`;
              queryParams.push(`%${filter.value}%`);
              break;
            case 'in':
              condition = `i."${filter.field}" IN (${filter.value.map(() => `$${paramCounter++}`).join(',')})`;
              queryParams.push(...filter.value);
              break;
            case 'null':
              condition = `i."${filter.field}" IS NULL`;
              break;
            case 'notnull':
              condition = `i."${filter.field}" IS NOT NULL`;
              break;
            default:
              condition = `i."${filter.field}" = $${paramCounter++}`;
              queryParams.push(filter.value);
          }
          
          queryText += ` AND ${condition}`;
        });
      }

      // Add group by clause
      queryText += ' GROUP BY i.id';

      // Add sorting if provided
      if (options?.sort && options.sort.length > 0) {
        const sortClauses = options.sort.map(sort => 
          `i."${sort.field}" ${sort.direction === 'desc' ? 'DESC' : 'ASC'}`
        );
        queryText += ` ORDER BY ${sortClauses.join(', ')}`;
      } else {
        // Default sorting by name
        queryText += ' ORDER BY i.name ASC';
      }

      // Add pagination if provided
      if (options?.page && options.limit) {
        const offset = (options.page - 1) * options.limit;
        queryText += ` LIMIT $${paramCounter++} OFFSET $${paramCounter++}`;
        queryParams.push(options.limit, offset);
      }

      const result = await query(queryText, queryParams);

      // Format the results to match the InventoryItem model
      const inventoryItems: InventoryItem[] = result.rows.map(row => ({
        id: row.id,
        sku: row.sku,
        name: row.name,
        description: row.description,
        category: row.category,
        basePrice: parseFloat(row.base_price),
        taxRate: parseFloat(row.tax_rate),
        reorderLevel: row.reorder_level,
        isActive: row.is_active,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        quantity: parseFloat(row.quantity)
      }));

      return {
        success: true,
        data: inventoryItems,
        rowCount: result.rowCount
      };
    } catch (error) {
      logger.error('Error in findAll inventory items:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Find inventory item by ID
   */
  async findById(id: number): Promise<DbResult<InventoryItem>> {
    try {
      const result = await query(`
        SELECT i.*,
          COALESCE(SUM(b.remaining_quantity), 0) as quantity
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
        WHERE i.id = $1
        GROUP BY i.id
      `, [id]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: `Inventory item with ID ${id} not found`
        };
      }

      const row = result.rows[0];

      const inventoryItem: InventoryItem = {
        id: row.id,
        sku: row.sku,
        name: row.name,
        description: row.description,
        category: row.category,
        basePrice: parseFloat(row.base_price),
        taxRate: parseFloat(row.tax_rate),
        reorderLevel: row.reorder_level,
        isActive: row.is_active,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        quantity: parseFloat(row.quantity)
      };

      return {
        success: true,
        data: inventoryItem
      };
    } catch (error) {
      logger.error(`Error in findById inventory item with ID ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Find inventory item by SKU
   */
  async findBySku(sku: string): Promise<DbResult<InventoryItem>> {
    try {
      const result = await query(`
        SELECT i.*,
          COALESCE(SUM(b.remaining_quantity), 0) as quantity
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
        WHERE i.sku = $1
        GROUP BY i.id
      `, [sku]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: `Inventory item with SKU ${sku} not found`
        };
      }

      const row = result.rows[0];

      const inventoryItem: InventoryItem = {
        id: row.id,
        sku: row.sku,
        name: row.name,
        description: row.description,
        category: row.category,
        basePrice: parseFloat(row.base_price),
        taxRate: parseFloat(row.tax_rate),
        reorderLevel: row.reorder_level,
        isActive: row.is_active,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        quantity: parseFloat(row.quantity)
      };

      return {
        success: true,
        data: inventoryItem
      };
    } catch (error) {
      logger.error(`Error in findBySku inventory item with SKU ${sku}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Create a new inventory item
   */
  async create(item: Partial<InventoryItem>): Promise<DbResult<InventoryItem>> {
    try {
      const sku = item.sku || `SKU-${uuidv4().substring(0, 8).toUpperCase()}`;
      
      const result = await query(`
        INSERT INTO inventory_items (
          sku,
          name,
          description,
          category,
          base_price,
          tax_rate,
          reorder_level,
          is_active,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        sku,
        item.name,
        item.description || '',
        item.category || 'General',
        item.basePrice || 0,
        item.taxRate || 0,
        item.reorderLevel || 10,
        item.isActive !== undefined ? item.isActive : true,
        item.metadata || {}
      ]);

      const row = result.rows[0];

      const inventoryItem: InventoryItem = {
        id: row.id,
        sku: row.sku,
        name: row.name,
        description: row.description,
        category: row.category,
        basePrice: parseFloat(row.base_price),
        taxRate: parseFloat(row.tax_rate),
        reorderLevel: row.reorder_level,
        isActive: row.is_active,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        quantity: 0
      };

      return {
        success: true,
        data: inventoryItem
      };
    } catch (error) {
      logger.error('Error in create inventory item:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Update an inventory item
   */
  async update(id: number, item: Partial<InventoryItem>): Promise<DbResult<InventoryItem>> {
    try {
      // Build the update query dynamically
      const updateFields: string[] = [];
      const queryParams: any[] = [];
      let paramCounter = 1;
      
      if (item.name !== undefined) {
        updateFields.push(`name = $${paramCounter++}`);
        queryParams.push(item.name);
      }
      
      if (item.description !== undefined) {
        updateFields.push(`description = $${paramCounter++}`);
        queryParams.push(item.description);
      }
      
      if (item.category !== undefined) {
        updateFields.push(`category = $${paramCounter++}`);
        queryParams.push(item.category);
      }
      
      if (item.basePrice !== undefined) {
        updateFields.push(`base_price = $${paramCounter++}`);
        queryParams.push(item.basePrice);
      }
      
      if (item.taxRate !== undefined) {
        updateFields.push(`tax_rate = $${paramCounter++}`);
        queryParams.push(item.taxRate);
      }
      
      if (item.reorderLevel !== undefined) {
        updateFields.push(`reorder_level = $${paramCounter++}`);
        queryParams.push(item.reorderLevel);
      }
      
      if (item.isActive !== undefined) {
        updateFields.push(`is_active = $${paramCounter++}`);
        queryParams.push(item.isActive);
      }
      
      if (item.metadata !== undefined) {
        updateFields.push(`metadata = $${paramCounter++}`);
        queryParams.push(item.metadata);
      }
      
      // Add the ID parameter
      queryParams.push(id);
      
      if (updateFields.length === 0) {
        return {
          success: false,
          error: 'No fields to update'
        };
      }
      
      const result = await query(`
        UPDATE inventory_items
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCounter}
        RETURNING *
      `, queryParams);
      
      if (result.rows.length === 0) {
        return {
          success: false,
          error: `Inventory item with ID ${id} not found`
        };
      }
      
      const row = result.rows[0];
      
      const inventoryItem: InventoryItem = {
        id: row.id,
        sku: row.sku,
        name: row.name,
        description: row.description,
        category: row.category,
        basePrice: parseFloat(row.base_price),
        taxRate: parseFloat(row.tax_rate),
        reorderLevel: row.reorder_level,
        isActive: row.is_active,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        quantity: 0
      };
      
      return {
        success: true,
        data: inventoryItem
      };
    } catch (error) {
      logger.error(`Error in update inventory item with ID ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Delete an inventory item (soft delete)
   */
  async delete(id: number): Promise<DbResult<void>> {
    try {
      const result = await query(`
        UPDATE inventory_items
        SET is_active = false
        WHERE id = $1
        RETURNING id
      `, [id]);
      
      if (result.rows.length === 0) {
        return {
          success: false,
          error: `Inventory item with ID ${id} not found`
        };
      }
      
      return {
        success: true
      };
    } catch (error) {
      logger.error(`Error in delete inventory item with ID ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Find low stock items
   */
  async findLowStock(): Promise<DbResult<InventoryItem[]>> {
    try {
      const result = await query(`
        SELECT i.*,
          COALESCE(SUM(b.remaining_quantity), 0) as quantity
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
        WHERE i.is_active = true
        GROUP BY i.id
        HAVING COALESCE(SUM(b.remaining_quantity), 0) <= i.reorder_level
        ORDER BY i.name
      `);
      
      // Format the results to match the InventoryItem model
      const inventoryItems: InventoryItem[] = result.rows.map(row => ({
        id: row.id,
        sku: row.sku,
        name: row.name,
        description: row.description,
        category: row.category,
        basePrice: parseFloat(row.base_price),
        taxRate: parseFloat(row.tax_rate),
        reorderLevel: row.reorder_level,
        isActive: row.is_active,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        quantity: parseFloat(row.quantity)
      }));
      
      return {
        success: true,
        data: inventoryItems,
        rowCount: result.rowCount
      };
    } catch (error) {
      logger.error('Error in findLowStock inventory items:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Search inventory items
   */
  async search(query: string): Promise<DbResult<InventoryItem[]>> {
    try {
      const result = await query(`
        SELECT i.*,
          COALESCE(SUM(b.remaining_quantity), 0) as quantity
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
        WHERE 
          i.is_active = true AND
          (i.name ILIKE $1 OR
          i.sku ILIKE $1 OR
          i.category ILIKE $1 OR
          CAST(i.metadata->>'barcode' AS TEXT) = $2)
        GROUP BY i.id
        ORDER BY i.name
      `, [`%${query}%`, query]);
      
      // Format the results to match the InventoryItem model
      const inventoryItems: InventoryItem[] = result.rows.map(row => ({
        id: row.id,
        sku: row.sku,
        name: row.name,
        description: row.description,
        category: row.category,
        basePrice: parseFloat(row.base_price),
        taxRate: parseFloat(row.tax_rate),
        reorderLevel: row.reorder_level,
        isActive: row.is_active,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        quantity: parseFloat(row.quantity)
      }));
      
      return {
        success: true,
        data: inventoryItems,
        rowCount: result.rowCount
      };
    } catch (error) {
      logger.error(`Error in search inventory items with query ${query}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}