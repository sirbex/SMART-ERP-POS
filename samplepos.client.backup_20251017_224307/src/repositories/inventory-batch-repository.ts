import pool from '../db/pool';
// import { handleDatabaseError } from '../utils/db-errors';

export interface DbInventoryBatch {
  id: number;
  inventory_item_id: number;
  batch_number: string;
  quantity: number;
  remaining_quantity: number;
  unit_cost: number;
  expiry_date?: string;
  received_date: string;
  supplier?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface BatchReduction {
  id: number;
  batchNumber: string;
  quantityUsed: number;
}

/**
 * Repository for inventory batch operations
 */
export class InventoryBatchRepository {
  /**
   * Find all batches
   */
  async findAll(): Promise<DbInventoryBatch[]> {
    try {
      const result = await pool.query(`
        SELECT * FROM inventory_batches
        ORDER BY expiry_date NULLS LAST, received_date
      `);
      
      return result.rows;
    } catch (error) {
      console.error('Error fetching inventory batches:', error);
      return [];
    }
  }
  
  /**
   * Find batch by ID
   */
  async findById(id: number): Promise<DbInventoryBatch | null> {
    try {
      const result = await pool.query(`
        SELECT * FROM inventory_batches
        WHERE id = $1
      `, [id]);
      
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Error fetching inventory batch with ID ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Find batches by inventory item ID
   */
  async findByItemId(itemId: number): Promise<DbInventoryBatch[]> {
    try {
      const result = await pool.query(`
        SELECT * FROM inventory_batches
        WHERE inventory_item_id = $1
        ORDER BY expiry_date NULLS LAST, received_date
      `, [itemId]);
      
      return result.rows;
    } catch (error) {
      console.error(`Error fetching batches for item ID ${itemId}:`, error);
      return [];
    }
  }
  
  /**
   * Find batches by batch number
   */
  async findByBatchNumber(batchNumber: string): Promise<DbInventoryBatch[]> {
    try {
      const result = await pool.query(`
        SELECT * FROM inventory_batches
        WHERE batch_number = $1
      `, [batchNumber]);
      
      return result.rows;
    } catch (error) {
      console.error(`Error fetching batches with batch number ${batchNumber}:`, error);
      return [];
    }
  }
  
  /**
   * Create a new inventory batch
   */
  async create(batch: Partial<DbInventoryBatch>): Promise<DbInventoryBatch | null> {
    try {
      const result = await pool.query(`
        INSERT INTO inventory_batches (
          inventory_item_id,
          batch_number,
          quantity,
          remaining_quantity,
          unit_cost,
          expiry_date,
          received_date,
          supplier,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        batch.inventory_item_id,
        batch.batch_number,
        batch.quantity || 0,
        batch.remaining_quantity || batch.quantity || 0,
        batch.unit_cost || 0,
        batch.expiry_date,
        batch.received_date || new Date().toISOString(),
        batch.supplier,
        batch.metadata || {}
      ]);
      
      return result.rows[0];
    } catch (error) {
      console.error('Error creating inventory batch:', error);
      return null;
    }
  }
  
  /**
   * Update an inventory batch
   */
  async update(id: number, batch: Partial<DbInventoryBatch>): Promise<DbInventoryBatch | null> {
    try {
      // Build the update query dynamically
      const fields = [];
      const values = [];
      let paramCount = 1;
      
      if (batch.batch_number !== undefined) {
        fields.push(`batch_number = $${paramCount}`);
        values.push(batch.batch_number);
        paramCount++;
      }
      
      if (batch.quantity !== undefined) {
        fields.push(`quantity = $${paramCount}`);
        values.push(batch.quantity);
        paramCount++;
      }
      
      if (batch.remaining_quantity !== undefined) {
        fields.push(`remaining_quantity = $${paramCount}`);
        values.push(batch.remaining_quantity);
        paramCount++;
      }
      
      if (batch.unit_cost !== undefined) {
        fields.push(`unit_cost = $${paramCount}`);
        values.push(batch.unit_cost);
        paramCount++;
      }
      
      if (batch.expiry_date !== undefined) {
        fields.push(`expiry_date = $${paramCount}`);
        values.push(batch.expiry_date);
        paramCount++;
      }
      
      if (batch.received_date !== undefined) {
        fields.push(`received_date = $${paramCount}`);
        values.push(batch.received_date);
        paramCount++;
      }
      
      if (batch.supplier !== undefined) {
        fields.push(`supplier = $${paramCount}`);
        values.push(batch.supplier);
        paramCount++;
      }
      
      if (batch.metadata !== undefined) {
        fields.push(`metadata = $${paramCount}`);
        values.push(batch.metadata);
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
        UPDATE inventory_batches
        SET ${fields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `, values);
      
      return result.rows[0];
    } catch (error) {
      console.error(`Error updating inventory batch with ID ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Delete an inventory batch
   */
  async delete(id: number): Promise<boolean> {
    try {
      // Check if there are any movements for this batch
      const movementResult = await pool.query(`
        SELECT COUNT(*) FROM inventory_movements WHERE inventory_batch_id = $1
      `, [id]);
      
      if (parseInt(movementResult.rows[0].count) > 0) {
        console.error(`Cannot delete batch ${id}: has movements`);
        return false;
      }
      
      // If no movements, proceed with deletion
      const result = await pool.query(`
        DELETE FROM inventory_batches WHERE id = $1
      `, [id]);
      
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error(`Error deleting inventory batch with ID ${id}:`, error);
      return false;
    }
  }
  
  /**
   * Find expiring batches within a specified number of days
   */
  async findExpiringBatches(days: number): Promise<DbInventoryBatch[]> {
    try {
      const result = await pool.query(`
        SELECT b.*, i.name as item_name
        FROM inventory_batches b
        JOIN inventory_items i ON b.inventory_item_id = i.id
        WHERE 
          b.expiry_date IS NOT NULL AND
          b.expiry_date <= CURRENT_DATE + $1 AND
          b.expiry_date >= CURRENT_DATE AND
          b.remaining_quantity > 0
        ORDER BY b.expiry_date
      `, [days]);
      
      return result.rows;
    } catch (error) {
      console.error(`Error fetching expiring batches within ${days} days:`, error);
      return [];
    }
  }
  
  /**
   * Find expired batches
   */
  async findExpiredBatches(): Promise<DbInventoryBatch[]> {
    try {
      const result = await pool.query(`
        SELECT b.*, i.name as item_name
        FROM inventory_batches b
        JOIN inventory_items i ON b.inventory_item_id = i.id
        WHERE 
          b.expiry_date IS NOT NULL AND
          b.expiry_date < CURRENT_DATE AND
          b.remaining_quantity > 0
        ORDER BY b.expiry_date
      `);
      
      return result.rows;
    } catch (error) {
      console.error('Error fetching expired batches:', error);
      return [];
    }
  }
  
  /**
   * Reduce inventory using FIFO method
   * Takes quantity from oldest batches first
   */
  async reduceInventory(
    itemId: number, 
    quantity: number
  ): Promise<{ 
    success: boolean; 
    batchesUsed: BatchReduction[]; 
    remainingQuantity: number 
  }> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get available batches ordered by expiry date and received date (FIFO)
      const batchResult = await client.query(`
        SELECT id, batch_number, remaining_quantity
        FROM inventory_batches
        WHERE 
          inventory_item_id = $1 AND
          remaining_quantity > 0
        ORDER BY 
          expiry_date NULLS LAST, 
          received_date
      `, [itemId]);
      
      const batches = batchResult.rows;
      let remainingToReduce = quantity;
      const batchesUsed: BatchReduction[] = [];
      
      // Check if we have enough stock
      const totalAvailable = batches.reduce(
        (sum: number, batch: any) => sum + parseFloat(batch.remaining_quantity), 
        0
      );
      
      if (totalAvailable < quantity) {
        await client.query('ROLLBACK');
        return { 
          success: false, 
          batchesUsed: [], 
          remainingQuantity: quantity 
        };
      }
      
      // Process batches in FIFO order
      for (const batch of batches) {
        if (remainingToReduce <= 0) break;
        
        const batchRemaining = parseFloat(batch.remaining_quantity);
        const quantityToTakeFromBatch = Math.min(batchRemaining, remainingToReduce);
        
        // Update batch quantity
        await client.query(`
          UPDATE inventory_batches
          SET 
            remaining_quantity = remaining_quantity - $1,
            updated_at = NOW()
          WHERE id = $2
        `, [quantityToTakeFromBatch, batch.id]);
        
        // Track this batch usage
        batchesUsed.push({
          id: batch.id,
          batchNumber: batch.batch_number,
          quantityUsed: quantityToTakeFromBatch
        });
        
        remainingToReduce -= quantityToTakeFromBatch;
      }
      
      await client.query('COMMIT');
      
      return {
        success: true,
        batchesUsed,
        remainingQuantity: remainingToReduce
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Error reducing inventory for item ${itemId}:`, error);
      return { 
        success: false, 
        batchesUsed: [], 
        remainingQuantity: quantity 
      };
    } finally {
      client.release();
    }
  }
}