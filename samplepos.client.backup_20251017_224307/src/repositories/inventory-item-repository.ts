import pool from '../db/pool';

export interface DbInventoryItem {
  id: number;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  base_price: number;
  tax_rate?: number;
  reorder_level: number;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  quantity?: number; // Aggregated value, not actually in DB table
}

/**
 * Repository for inventory item operations
 */
export class InventoryItemRepository {
  /**
   * Find all inventory items with aggregated quantity
   */
  async findAll(): Promise<DbInventoryItem[]> {
    try {
      const result = await pool.query(`
        SELECT i.*,
          COALESCE(SUM(b.remaining_quantity), 0) as quantity
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
        WHERE i.is_active = true
        GROUP BY i.id
        ORDER BY i.name
      `);
      
      return result.rows;
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      return [];
    }
  }
  
  /**
   * Find inventory item by ID
   */
  async findById(id: number): Promise<DbInventoryItem | null> {
    try {
      const result = await pool.query(`
        SELECT i.*,
          COALESCE(SUM(b.remaining_quantity), 0) as quantity
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
        WHERE i.id = $1
        GROUP BY i.id
      `, [id]);
      
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Error fetching inventory item with ID ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Find inventory item by SKU
   */
  async findBySku(sku: string): Promise<DbInventoryItem | null> {
    try {
      const result = await pool.query(`
        SELECT i.*,
          COALESCE(SUM(b.remaining_quantity), 0) as quantity
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
        WHERE i.sku = $1
        GROUP BY i.id
      `, [sku]);
      
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Error fetching inventory item with SKU ${sku}:`, error);
      return null;
    }
  }
  
  /**
   * Find inventory items by name (partial match)
   */
  async findByName(name: string): Promise<DbInventoryItem[]> {
    try {
      const result = await pool.query(`
        SELECT i.*,
          COALESCE(SUM(b.remaining_quantity), 0) as quantity
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
        WHERE i.name ILIKE $1
        GROUP BY i.id
        ORDER BY i.name
      `, [`%${name}%`]);
      
      return result.rows;
    } catch (error) {
      console.error(`Error fetching inventory items with name like ${name}:`, error);
      return [];
    }
  }
  
  /**
   * Find low stock items
   */
  async findLowStock(): Promise<DbInventoryItem[]> {
    try {
      const result = await pool.query(`
        SELECT i.*,
          COALESCE(SUM(b.remaining_quantity), 0) as quantity
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
        GROUP BY i.id
        HAVING COALESCE(SUM(b.remaining_quantity), 0) <= i.reorder_level
        ORDER BY i.name
      `);
      
      return result.rows;
    } catch (error) {
      console.error('Error fetching low stock items:', error);
      return [];
    }
  }
  
  /**
   * Create a new inventory item
   */
  async create(item: Partial<DbInventoryItem>): Promise<DbInventoryItem | null> {
    try {
      const result = await pool.query(`
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
        item.sku,
        item.name,
        item.description || '',
        item.category || 'General',
        item.base_price || 0,
        item.tax_rate || 0,
        item.reorder_level || 10,
        item.is_active !== undefined ? item.is_active : true,
        item.metadata || {}
      ]);
      
      return result.rows[0];
    } catch (error) {
      console.error('Error creating inventory item:', error);
      return null;
    }
  }
  
  /**
   * Update an inventory item
   */
  async update(id: number, item: Partial<DbInventoryItem>): Promise<DbInventoryItem | null> {
    try {
      // Build the update query dynamically
      const fields = [];
      const values = [];
      let paramCount = 1;
      
      if (item.name !== undefined) {
        fields.push(`name = $${paramCount}`);
        values.push(item.name);
        paramCount++;
      }
      
      if (item.description !== undefined) {
        fields.push(`description = $${paramCount}`);
        values.push(item.description);
        paramCount++;
      }
      
      if (item.category !== undefined) {
        fields.push(`category = $${paramCount}`);
        values.push(item.category);
        paramCount++;
      }
      
      if (item.base_price !== undefined) {
        fields.push(`base_price = $${paramCount}`);
        values.push(item.base_price);
        paramCount++;
      }
      
      if (item.tax_rate !== undefined) {
        fields.push(`tax_rate = $${paramCount}`);
        values.push(item.tax_rate);
        paramCount++;
      }
      
      if (item.reorder_level !== undefined) {
        fields.push(`reorder_level = $${paramCount}`);
        values.push(item.reorder_level);
        paramCount++;
      }
      
      if (item.is_active !== undefined) {
        fields.push(`is_active = $${paramCount}`);
        values.push(item.is_active);
        paramCount++;
      }
      
      if (item.metadata !== undefined) {
        fields.push(`metadata = $${paramCount}`);
        values.push(item.metadata);
        paramCount++;
      }
      
      // Add updated_at
      fields.push(`updated_at = NOW()`);
      
      if (fields.length === 0) {
        return null; // Nothing to update
      }
      
      // Add the ID parameter
      values.push(id);
      
      const result = await pool.query(`
        UPDATE inventory_items
        SET ${fields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `, values);
      
      return result.rows[0];
    } catch (error) {
      console.error(`Error updating inventory item with ID ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Delete an inventory item (soft delete)
   */
  async delete(id: number): Promise<boolean> {
    try {
      const result = await pool.query(`
        UPDATE inventory_items
        SET is_active = false, updated_at = NOW()
        WHERE id = $1
      `, [id]);
      
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error(`Error deleting inventory item with ID ${id}:`, error);
      return false;
    }
  }
  
  /**
   * Permanently delete an inventory item (use with caution)
   */
  async permanentDelete(id: number): Promise<boolean> {
    try {
      // First check if there are any batches or movements
      const batchResult = await pool.query(`
        SELECT COUNT(*) FROM inventory_batches WHERE inventory_item_id = $1
      `, [id]);
      
      const movementResult = await pool.query(`
        SELECT COUNT(*) FROM inventory_movements WHERE inventory_item_id = $1
      `, [id]);
      
      if (
        parseInt(batchResult.rows[0].count) > 0 ||
        parseInt(movementResult.rows[0].count) > 0
      ) {
        console.error(`Cannot permanently delete item ${id}: has batches or movements`);
        return false;
      }
      
      // If no related records, proceed with deletion
      const result = await pool.query(`
        DELETE FROM inventory_items WHERE id = $1
      `, [id]);
      
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error(`Error permanently deleting inventory item with ID ${id}:`, error);
      return false;
    }
  }
  
  /**
   * Search inventory items
   */
  async search(query: string): Promise<DbInventoryItem[]> {
    try {
      const result = await pool.query(`
        SELECT i.*,
          COALESCE(SUM(b.remaining_quantity), 0) as quantity
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
        WHERE 
          i.name ILIKE $1 OR
          i.sku ILIKE $1 OR
          i.category ILIKE $1 OR
          CAST(i.metadata->>'barcode' AS TEXT) = $2
        GROUP BY i.id
        ORDER BY i.name
      `, [`%${query}%`, query]);
      
      return result.rows;
    } catch (error) {
      console.error(`Error searching inventory items with query ${query}:`, error);
      return [];
    }
  }
}