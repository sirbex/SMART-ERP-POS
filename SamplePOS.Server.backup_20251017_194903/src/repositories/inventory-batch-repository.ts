import { query, getClient } from '../db/pool';
import { logger } from '../utils/logger';
import { InventoryBatch } from '../models/inventory-batch';
import { DbResult, QueryOptions } from '../types/database';
import { v4 as uuidv4 } from 'uuid';

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
   * Find all batches with optional filtering and pagination
   */
  async findAll(options?: QueryOptions): Promise<DbResult<InventoryBatch[]>> {
    try {
      // Build the query based on options
      let queryText = `
        SELECT b.*, i.name as item_name
        FROM inventory_batches b
        JOIN inventory_items i ON b.inventory_item_id = i.id
        WHERE 1=1
      `;

      const queryParams: any[] = [];
      let paramCounter = 1;

      // Apply filters if provided
      if (options?.filters && options.filters.length > 0) {
        options.filters.forEach(filter => {
          let condition: string;
          
          switch (filter.operator) {
            case 'eq':
              condition = `b."${filter.field}" = $${paramCounter++}`;
              queryParams.push(filter.value);
              break;
            case 'neq':
              condition = `b."${filter.field}" != $${paramCounter++}`;
              queryParams.push(filter.value);
              break;
            case 'gt':
              condition = `b."${filter.field}" > $${paramCounter++}`;
              queryParams.push(filter.value);
              break;
            case 'gte':
              condition = `b."${filter.field}" >= $${paramCounter++}`;
              queryParams.push(filter.value);
              break;
            case 'lt':
              condition = `b."${filter.field}" < $${paramCounter++}`;
              queryParams.push(filter.value);
              break;
            case 'lte':
              condition = `b."${filter.field}" <= $${paramCounter++}`;
              queryParams.push(filter.value);
              break;
            case 'like':
              condition = `b."${filter.field}" LIKE $${paramCounter++}`;
              queryParams.push(`%${filter.value}%`);
              break;
            case 'ilike':
              condition = `b."${filter.field}" ILIKE $${paramCounter++}`;
              queryParams.push(`%${filter.value}%`);
              break;
            case 'in':
              condition = `b."${filter.field}" IN (${filter.value.map(() => `$${paramCounter++}`).join(',')})`;
              queryParams.push(...filter.value);
              break;
            case 'null':
              condition = `b."${filter.field}" IS NULL`;
              break;
            case 'notnull':
              condition = `b."${filter.field}" IS NOT NULL`;
              break;
            default:
              condition = `b."${filter.field}" = $${paramCounter++}`;
              queryParams.push(filter.value);
          }
          
          queryText += ` AND ${condition}`;
        });
      }

      // Add sorting if provided
      if (options?.sort && options.sort.length > 0) {
        const sortClauses = options.sort.map(sort => 
          `b."${sort.field}" ${sort.direction === 'desc' ? 'DESC' : 'ASC'}`
        );
        queryText += ` ORDER BY ${sortClauses.join(', ')}`;
      } else {
        // Default sorting by expiry date and received date
        queryText += ' ORDER BY b.expiry_date NULLS LAST, b.received_date ASC';
      }

      // Add pagination if provided
      if (options?.page && options.limit) {
        const offset = (options.page - 1) * options.limit;
        queryText += ` LIMIT $${paramCounter++} OFFSET $${paramCounter++}`;
        queryParams.push(options.limit, offset);
      }

      const result = await query(queryText, queryParams);

      // Format the results to match the InventoryBatch model
      const inventoryBatches: InventoryBatch[] = result.rows.map(row => ({
        id: row.id,
        inventoryItemId: row.inventory_item_id,
        batchNumber: row.batch_number,
        quantity: parseFloat(row.quantity),
        remainingQuantity: parseFloat(row.remaining_quantity),
        unitCost: parseFloat(row.unit_cost),
        expiryDate: row.expiry_date,
        receivedDate: row.received_date,
        supplier: row.supplier,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        itemName: row.item_name
      }));

      return {
        success: true,
        data: inventoryBatches,
        rowCount: result.rowCount
      };
    } catch (error) {
      logger.error('Error in findAll inventory batches:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Find batch by ID
   */
  async findById(id: number): Promise<DbResult<InventoryBatch>> {
    try {
      const result = await query(`
        SELECT b.*, i.name as item_name
        FROM inventory_batches b
        JOIN inventory_items i ON b.inventory_item_id = i.id
        WHERE b.id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: `Inventory batch with ID ${id} not found`
        };
      }

      const row = result.rows[0];

      const inventoryBatch: InventoryBatch = {
        id: row.id,
        inventoryItemId: row.inventory_item_id,
        batchNumber: row.batch_number,
        quantity: parseFloat(row.quantity),
        remainingQuantity: parseFloat(row.remaining_quantity),
        unitCost: parseFloat(row.unit_cost),
        expiryDate: row.expiry_date,
        receivedDate: row.received_date,
        supplier: row.supplier,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        itemName: row.item_name
      };

      return {
        success: true,
        data: inventoryBatch
      };
    } catch (error) {
      logger.error(`Error in findById inventory batch with ID ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Find batches by inventory item ID
   */
  async findByItemId(itemId: number): Promise<DbResult<InventoryBatch[]>> {
    try {
      const result = await query(`
        SELECT b.*, i.name as item_name
        FROM inventory_batches b
        JOIN inventory_items i ON b.inventory_item_id = i.id
        WHERE b.inventory_item_id = $1
        ORDER BY b.expiry_date NULLS LAST, b.received_date
      `, [itemId]);

      // Format the results to match the InventoryBatch model
      const inventoryBatches: InventoryBatch[] = result.rows.map(row => ({
        id: row.id,
        inventoryItemId: row.inventory_item_id,
        batchNumber: row.batch_number,
        quantity: parseFloat(row.quantity),
        remainingQuantity: parseFloat(row.remaining_quantity),
        unitCost: parseFloat(row.unit_cost),
        expiryDate: row.expiry_date,
        receivedDate: row.received_date,
        supplier: row.supplier,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        itemName: row.item_name
      }));

      return {
        success: true,
        data: inventoryBatches,
        rowCount: result.rowCount
      };
    } catch (error) {
      logger.error(`Error in findByItemId inventory batches with item ID ${itemId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Create a new inventory batch
   */
  async create(batch: Partial<InventoryBatch>): Promise<DbResult<InventoryBatch>> {
    try {
      const batchNumber = batch.batchNumber || `BATCH-${uuidv4().substring(0, 8).toUpperCase()}`;
      
      const result = await query(`
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
        batch.inventoryItemId,
        batchNumber,
        batch.quantity || 0,
        batch.remainingQuantity || batch.quantity || 0,
        batch.unitCost || 0,
        batch.expiryDate,
        batch.receivedDate || new Date().toISOString(),
        batch.supplier || null,
        batch.metadata || {}
      ]);

      const row = result.rows[0];

      // Get the item name
      const itemResult = await query(`
        SELECT name FROM inventory_items WHERE id = $1
      `, [row.inventory_item_id]);

      const itemName = itemResult.rows.length > 0 ? itemResult.rows[0].name : null;

      const inventoryBatch: InventoryBatch = {
        id: row.id,
        inventoryItemId: row.inventory_item_id,
        batchNumber: row.batch_number,
        quantity: parseFloat(row.quantity),
        remainingQuantity: parseFloat(row.remaining_quantity),
        unitCost: parseFloat(row.unit_cost),
        expiryDate: row.expiry_date,
        receivedDate: row.received_date,
        supplier: row.supplier,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        itemName
      };

      return {
        success: true,
        data: inventoryBatch
      };
    } catch (error) {
      logger.error('Error in create inventory batch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Update an inventory batch
   */
  async update(id: number, batch: Partial<InventoryBatch>): Promise<DbResult<InventoryBatch>> {
    try {
      // Build the update query dynamically
      const updateFields: string[] = [];
      const queryParams: any[] = [];
      let paramCounter = 1;
      
      if (batch.batchNumber !== undefined) {
        updateFields.push(`batch_number = $${paramCounter++}`);
        queryParams.push(batch.batchNumber);
      }
      
      if (batch.quantity !== undefined) {
        updateFields.push(`quantity = $${paramCounter++}`);
        queryParams.push(batch.quantity);
      }
      
      if (batch.remainingQuantity !== undefined) {
        updateFields.push(`remaining_quantity = $${paramCounter++}`);
        queryParams.push(batch.remainingQuantity);
      }
      
      if (batch.unitCost !== undefined) {
        updateFields.push(`unit_cost = $${paramCounter++}`);
        queryParams.push(batch.unitCost);
      }
      
      if (batch.expiryDate !== undefined) {
        updateFields.push(`expiry_date = $${paramCounter++}`);
        queryParams.push(batch.expiryDate);
      }
      
      if (batch.receivedDate !== undefined) {
        updateFields.push(`received_date = $${paramCounter++}`);
        queryParams.push(batch.receivedDate);
      }
      
      if (batch.supplier !== undefined) {
        updateFields.push(`supplier = $${paramCounter++}`);
        queryParams.push(batch.supplier);
      }
      
      if (batch.metadata !== undefined) {
        updateFields.push(`metadata = $${paramCounter++}`);
        queryParams.push(batch.metadata);
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
        UPDATE inventory_batches
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCounter}
        RETURNING *
      `, queryParams);
      
      if (result.rows.length === 0) {
        return {
          success: false,
          error: `Inventory batch with ID ${id} not found`
        };
      }
      
      const row = result.rows[0];
      
      // Get the item name
      const itemResult = await query(`
        SELECT name FROM inventory_items WHERE id = $1
      `, [row.inventory_item_id]);

      const itemName = itemResult.rows.length > 0 ? itemResult.rows[0].name : null;
      
      const inventoryBatch: InventoryBatch = {
        id: row.id,
        inventoryItemId: row.inventory_item_id,
        batchNumber: row.batch_number,
        quantity: parseFloat(row.quantity),
        remainingQuantity: parseFloat(row.remaining_quantity),
        unitCost: parseFloat(row.unit_cost),
        expiryDate: row.expiry_date,
        receivedDate: row.received_date,
        supplier: row.supplier,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        itemName
      };
      
      return {
        success: true,
        data: inventoryBatch
      };
    } catch (error) {
      logger.error(`Error in update inventory batch with ID ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Delete an inventory batch
   */
  async delete(id: number): Promise<DbResult<void>> {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // Check if there are any movements for this batch
      const movementResult = await client.query(`
        SELECT COUNT(*) FROM inventory_movements WHERE inventory_batch_id = $1
      `, [id]);
      
      if (parseInt(movementResult.rows[0].count) > 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: `Cannot delete batch with ID ${id}: It has associated inventory movements`
        };
      }
      
      // If no movements, proceed with deletion
      const result = await client.query(`
        DELETE FROM inventory_batches WHERE id = $1
        RETURNING id
      `, [id]);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: `Inventory batch with ID ${id} not found`
        };
      }
      
      await client.query('COMMIT');
      return {
        success: true
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error in delete inventory batch with ID ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    } finally {
      client.release();
    }
  }

  /**
   * Find expiring batches within a specified number of days
   */
  async findExpiringBatches(days: number): Promise<DbResult<InventoryBatch[]>> {
    try {
      const result = await query(`
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
      
      // Format the results to match the InventoryBatch model
      const inventoryBatches: InventoryBatch[] = result.rows.map(row => ({
        id: row.id,
        inventoryItemId: row.inventory_item_id,
        batchNumber: row.batch_number,
        quantity: parseFloat(row.quantity),
        remainingQuantity: parseFloat(row.remaining_quantity),
        unitCost: parseFloat(row.unit_cost),
        expiryDate: row.expiry_date,
        receivedDate: row.received_date,
        supplier: row.supplier,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        itemName: row.item_name
      }));
      
      return {
        success: true,
        data: inventoryBatches,
        rowCount: result.rowCount
      };
    } catch (error) {
      logger.error(`Error in findExpiringBatches within ${days} days:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
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
    remainingQuantity: number;
    error?: string;
  }> {
    const client = await getClient();
    
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
        (sum: number, batch: { remaining_quantity: string }) => sum + parseFloat(batch.remaining_quantity), 
        0
      );
      
      if (totalAvailable < quantity) {
        await client.query('ROLLBACK');
        return { 
          success: false,
          batchesUsed: [],
          remainingQuantity: quantity,
          error: `Insufficient stock for item ID ${itemId}. Required: ${quantity}, Available: ${totalAvailable}`
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
      logger.error(`Error reducing inventory for item ${itemId}:`, error);
      return {
        success: false,
        batchesUsed: [],
        remainingQuantity: quantity,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    } finally {
      client.release();
    }
  }
}