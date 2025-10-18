import pool from '../db/pool';
import { handleDatabaseError } from '../utils/db-errors';
import { v4 as uuidv4 } from 'uuid';
import type { DbTransactionItem } from './transaction-repository';

/**
 * Repository for transaction item operations
 */
export class TransactionItemRepository {
  /**
   * Create a new transaction item
   */
  async create(item: Omit<DbTransactionItem, 'id' | 'created_at'>): Promise<DbTransactionItem | null> {
    try {
      const itemId = uuidv4();
      const result = await pool.query(`
        INSERT INTO transaction_items (
          id,
          transaction_id,
          inventory_item_id,
          name,
          sku,
          price,
          quantity,
          unit,
          uom_display_name,
          conversion_factor,
          discount,
          subtotal,
          tax,
          total,
          cost_price,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `, [
        itemId,
        item.transaction_id,
        item.inventory_item_id,
        item.name,
        item.sku || '',
        item.price,
        item.quantity,
        item.unit || 'piece',
        item.uom_display_name || null,
        item.conversion_factor || 1,
        item.discount || 0,
        item.subtotal,
        item.tax || 0,
        item.total,
        item.cost_price || 0,
        item.notes || ''
      ]);
      
      return result.rows[0];
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'transaction item creation');
      console.error(errorResponse);
      return null;
    }
  }

  /**
   * Create multiple transaction items in a batch
   */
  async createBatch(items: Omit<DbTransactionItem, 'id' | 'created_at'>[]): Promise<DbTransactionItem[]> {
    if (!items.length) return [];
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const createdItems = [];
      
      for (const item of items) {
        const itemId = uuidv4();
        const result = await client.query(`
          INSERT INTO transaction_items (
            id,
            transaction_id,
            inventory_item_id,
            name,
            sku,
            price,
            quantity,
            unit,
            uom_display_name,
            conversion_factor,
            discount,
            subtotal,
            tax,
            total,
            cost_price,
            notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING *
        `, [
          itemId,
          item.transaction_id,
          item.inventory_item_id,
          item.name,
          item.sku || '',
          item.price,
          item.quantity,
          item.unit || 'piece',
          item.uom_display_name || null,
          item.conversion_factor || 1,
          item.discount || 0,
          item.subtotal,
          item.tax || 0,
          item.total,
          item.cost_price || 0,
          item.notes || ''
        ]);
        
        createdItems.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      return createdItems;
    } catch (error) {
      await client.query('ROLLBACK');
      const errorResponse = handleDatabaseError(error, 'batch transaction item creation');
      console.error(errorResponse);
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * Find transaction items by transaction ID
   */
  async findByTransactionId(transactionId: string): Promise<DbTransactionItem[]> {
    try {
      const result = await pool.query(`
        SELECT i.*, 
          inv.name as inventory_name,
          inv.sku as inventory_sku
        FROM transaction_items i
        JOIN inventory_items inv ON i.inventory_item_id = inv.id
        WHERE i.transaction_id = $1
        ORDER BY i.created_at
      `, [transactionId]);
      
      return result.rows;
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'transaction items lookup');
      console.error(errorResponse);
      return [];
    }
  }
  
  /**
   * Find items by inventory item ID
   */
  async findByInventoryItemId(inventoryItemId: number, limit = 50, offset = 0): Promise<DbTransactionItem[]> {
    try {
      const result = await pool.query(`
        SELECT i.*, 
          t.created_at as transaction_date,
          t.payment_method,
          inv.name as inventory_name,
          inv.sku as inventory_sku
        FROM transaction_items i
        JOIN transactions t ON i.transaction_id = t.id
        JOIN inventory_items inv ON i.inventory_item_id = inv.id
        WHERE i.inventory_item_id = $1
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3
      `, [inventoryItemId, limit, offset]);
      
      return result.rows;
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'inventory sales history lookup');
      console.error(errorResponse);
      return [];
    }
  }
  
  /**
   * Get top selling items in a date range
   */
  async getTopSellingItems(startDate: string, endDate: string, limit = 20): Promise<any[]> {
    try {
      const result = await pool.query(`
        SELECT 
          i.inventory_item_id,
          inv.name,
          inv.sku,
          SUM(i.quantity) as total_quantity_sold,
          SUM(i.total) as total_sales,
          COUNT(DISTINCT i.transaction_id) as transaction_count,
          AVG(i.price) as average_price
        FROM transaction_items i
        JOIN transactions t ON i.transaction_id = t.id
        JOIN inventory_items inv ON i.inventory_item_id = inv.id
        WHERE t.created_at BETWEEN $1 AND $2
        GROUP BY i.inventory_item_id, inv.name, inv.sku
        ORDER BY total_sales DESC
        LIMIT $3
      `, [startDate, endDate, limit]);
      
      return result.rows;
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'top selling items lookup');
      console.error(errorResponse);
      return [];
    }
  }
  
  /**
   * Get sales by category in a date range
   */
  async getSalesByCategory(startDate: string, endDate: string): Promise<any[]> {
    try {
      const result = await pool.query(`
        SELECT 
          COALESCE(inv.category, 'Uncategorized') as category,
          COUNT(DISTINCT i.transaction_id) as transaction_count,
          SUM(i.quantity) as total_quantity,
          SUM(i.total) as total_sales
        FROM transaction_items i
        JOIN transactions t ON i.transaction_id = t.id
        JOIN inventory_items inv ON i.inventory_item_id = inv.id
        WHERE t.created_at BETWEEN $1 AND $2
        GROUP BY inv.category
        ORDER BY total_sales DESC
      `, [startDate, endDate]);
      
      return result.rows;
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'sales by category lookup');
      console.error(errorResponse);
      return [];
    }
  }
}