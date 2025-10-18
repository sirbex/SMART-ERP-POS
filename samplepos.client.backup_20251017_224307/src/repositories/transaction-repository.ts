import pool from '../db/pool';
import { handleDatabaseError } from '../utils/db-errors';
import { v4 as uuidv4 } from 'uuid';

export interface DbTransaction {
  id: string;
  customer_id?: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_method: string;
  payment_status: string;
  amount_paid: number;
  change_amount: number;
  metadata?: Record<string, any>;
  notes?: string;
  created_by?: string;
  created_at: string;
}

export interface DbTransactionItem {
  id: string;
  transaction_id: string;
  inventory_item_id: number;
  name: string;
  sku?: string;
  price: number;
  quantity: number;
  unit?: string;
  uom_display_name?: string;
  conversion_factor?: number;
  discount?: number;
  subtotal: number;
  tax?: number;
  total: number;
  cost_price?: number;
  notes?: string;
  created_at: string;
}

/**
 * Repository for transaction operations
 */
export class TransactionRepository {
  /**
   * Create a new transaction
   */
  async create(transaction: Omit<DbTransaction, 'id' | 'created_at'>): Promise<DbTransaction | null> {
    try {
      const transactionId = uuidv4();
      const result = await pool.query(`
        INSERT INTO transactions (
          id,
          customer_id,
          subtotal,
          tax,
          discount,
          total,
          payment_method,
          payment_status,
          amount_paid,
          change_amount,
          metadata,
          notes,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        transactionId,
        transaction.customer_id || null,
        transaction.subtotal,
        transaction.tax,
        transaction.discount || 0,
        transaction.total,
        transaction.payment_method,
        transaction.payment_status,
        transaction.amount_paid,
        transaction.change_amount || 0,
        transaction.metadata || {},
        transaction.notes || '',
        transaction.created_by || 'system'
      ]);
      
      return result.rows[0];
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'transaction creation');
      console.error(errorResponse);
      return null;
    }
  }

  /**
   * Find transaction by ID with items
   */
  async findById(id: string): Promise<DbTransaction | null> {
    try {
      // Get transaction
      const transactionResult = await pool.query(`
        SELECT t.*,
          c.name as customer_name,
          c.email as customer_email,
          c.phone as customer_phone
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.id
        WHERE t.id = $1
      `, [id]);
      
      if (transactionResult.rows.length === 0) {
        return null;
      }

      const transaction = transactionResult.rows[0];
      
      // Get transaction items
      const itemsResult = await pool.query(`
        SELECT i.*, 
          inv.name as inventory_name,
          inv.sku as inventory_sku
        FROM transaction_items i
        JOIN inventory_items inv ON i.inventory_item_id = inv.id
        WHERE i.transaction_id = $1
        ORDER BY i.created_at
      `, [id]);
      
      // Add items to transaction
      transaction.items = itemsResult.rows;
      
      return transaction;
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'transaction lookup');
      console.error(errorResponse);
      return null;
    }
  }
  
  /**
   * Find transactions by customer ID
   */
  async findByCustomerId(customerId: string, limit = 50, offset = 0): Promise<DbTransaction[]> {
    try {
      const result = await pool.query(`
        SELECT t.*,
          (SELECT COUNT(*) FROM transaction_items WHERE transaction_id = t.id) as item_count,
          c.name as customer_name
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.id
        WHERE t.customer_id = $1
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3
      `, [customerId, limit, offset]);
      
      return result.rows;
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'customer transactions lookup');
      console.error(errorResponse);
      return [];
    }
  }
  
  /**
   * Get recent transactions
   */
  async getRecentTransactions(limit = 50): Promise<DbTransaction[]> {
    try {
      const result = await pool.query(`
        SELECT t.*,
          (SELECT COUNT(*) FROM transaction_items WHERE transaction_id = t.id) as item_count,
          COALESCE(c.name, 'Guest') as customer_name
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.id
        ORDER BY t.created_at DESC
        LIMIT $1
      `, [limit]);
      
      return result.rows;
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'recent transactions lookup');
      console.error(errorResponse);
      return [];
    }
  }
  
  /**
   * Search transactions
   */
  async search(query: string, limit = 50): Promise<DbTransaction[]> {
    try {
      const result = await pool.query(`
        SELECT t.*,
          (SELECT COUNT(*) FROM transaction_items WHERE transaction_id = t.id) as item_count,
          COALESCE(c.name, 'Guest') as customer_name
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.id
        WHERE 
          t.id LIKE $1 OR
          CAST(t.total AS TEXT) LIKE $1 OR
          COALESCE(c.name, '') LIKE $1 OR
          COALESCE(c.phone, '') LIKE $1 OR
          COALESCE(c.email, '') LIKE $1
        ORDER BY t.created_at DESC
        LIMIT $2
      `, [`%${query}%`, limit]);
      
      return result.rows;
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'transaction search');
      console.error(errorResponse);
      return [];
    }
  }
  
  /**
   * Get transactions by date range
   */
  async getByDateRange(startDate: string, endDate: string, limit = 100): Promise<DbTransaction[]> {
    try {
      const result = await pool.query(`
        SELECT t.*,
          (SELECT COUNT(*) FROM transaction_items WHERE transaction_id = t.id) as item_count,
          COALESCE(c.name, 'Guest') as customer_name
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.id
        WHERE t.created_at BETWEEN $1 AND $2
        ORDER BY t.created_at DESC
        LIMIT $3
      `, [startDate, endDate, limit]);
      
      return result.rows;
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'date range transactions lookup');
      console.error(errorResponse);
      return [];
    }
  }
  
  /**
   * Get transactions summary by date range
   */
  async getSummaryByDateRange(startDate: string, endDate: string): Promise<any> {
    try {
      // Get total sales and transaction count
      const salesResult = await pool.query(`
        SELECT 
          COUNT(*) as transaction_count,
          SUM(total) as total_sales,
          SUM(subtotal) as subtotal,
          SUM(tax) as tax,
          SUM(discount) as discount,
          AVG(total) as average_sale,
          MAX(total) as highest_sale
        FROM transactions
        WHERE created_at BETWEEN $1 AND $2
      `, [startDate, endDate]);
      
      // Get payment methods breakdown
      const paymentMethodsResult = await pool.query(`
        SELECT 
          payment_method,
          COUNT(*) as count,
          SUM(total) as total
        FROM transactions
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY payment_method
        ORDER BY total DESC
      `, [startDate, endDate]);
      
      // Get hourly distribution
      const hourlyResult = await pool.query(`
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as transaction_count,
          SUM(total) as total_sales
        FROM transactions
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY hour
        ORDER BY hour
      `, [startDate, endDate]);
      
      return {
        summary: salesResult.rows[0] || { 
          transaction_count: 0, 
          total_sales: 0,
          subtotal: 0,
          tax: 0,
          discount: 0,
          average_sale: 0,
          highest_sale: 0
        },
        payment_methods: paymentMethodsResult.rows || [],
        hourly_distribution: hourlyResult.rows || []
      };
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'summary report generation');
      console.error(errorResponse);
      return {
        summary: { 
          transaction_count: 0, 
          total_sales: 0,
          subtotal: 0,
          tax: 0,
          discount: 0,
          average_sale: 0,
          highest_sale: 0
        },
        payment_methods: [],
        hourly_distribution: []
      };
    }
  }

  /**
   * Get sales trends by date range (daily)
   */
  async getSalesTrends(startDate: string, endDate: string): Promise<any[]> {
    try {
      const result = await pool.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as transaction_count,
          SUM(total) as total_sales,
          AVG(total) as average_sale
        FROM transactions
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY DATE(created_at)
        ORDER BY date
      `, [startDate, endDate]);
      
      return result.rows;
    } catch (error) {
      const errorResponse = handleDatabaseError(error, 'sales trends lookup');
      console.error(errorResponse);
      return [];
    }
  }
}