/**
 * Transaction Controller
 */

const { pool } = require('../db/pool');
const { v4: uuidv4 } = require('uuid');

/**
 * Get all transactions
 */
const getAllTransactions = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        t.id, t.invoice_no as "invoiceNo", t.customer_id as "customerId", c.name as "customerName",
        t.subtotal, t.tax, t.discount, t.total, 
        t.payment_method as "paymentMethod", t.payment_status as "paymentStatus", 
        t.amount_paid as "amountPaid", t.change_amount as "changeAmount",
        t.notes, t.created_by as "createdBy", t.created_at as "createdAt",
        t.metadata
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      ORDER BY t.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
};

/**
 * Get recent transactions
 */
const getRecentTransactions = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        t.id, t.invoice_no as "invoiceNo", t.customer_id as "customerId", c.name as "customerName",
        t.subtotal, t.tax, t.discount, t.total, 
        t.payment_method as "paymentMethod", t.payment_status as "paymentStatus", 
        t.amount_paid as "amountPaid", t.change_amount as "changeAmount",
        t.notes, t.created_by as "createdBy", t.created_at as "createdAt",
        t.metadata,
        COALESCE(item_counts.item_count, 0) as "itemCount"
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN (
        SELECT transaction_id, COUNT(*) as item_count
        FROM transaction_items
        GROUP BY transaction_id
      ) item_counts ON t.id = item_counts.transaction_id
      ORDER BY t.created_at DESC
      LIMIT $1
    `, [limit]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting recent transactions:', error);
    res.status(500).json({ error: 'Failed to get recent transactions' });
  }
};

/**
 * Get a transaction by ID
 */
const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get transaction details
    const transactionResult = await pool.query(`
      SELECT 
        t.id, t.invoice_no as "invoiceNo", t.customer_id as "customerId", c.name as "customerName",
        c.email as "customerEmail", c.phone as "customerPhone",
        t.subtotal, t.tax, t.discount, t.total, 
        t.payment_method as "paymentMethod", t.payment_status as "paymentStatus", 
        t.amount_paid as "amountPaid", t.change_amount as "changeAmount",
        t.notes, t.created_by as "createdBy", t.created_at as "createdAt",
        t.metadata
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.id = $1
    `, [id]);

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transaction = transactionResult.rows[0];
    
    // Get transaction items
    const itemsResult = await pool.query(`
      SELECT 
        id, transaction_id as "transactionId", inventory_item_id as "inventoryItemId",
        name, sku, price, quantity, unit, uom_display_name as "uomDisplayName",
        conversion_factor as "conversionFactor", discount, subtotal, tax, total,
        cost_price as "costPrice", notes, created_at as "createdAt"
      FROM transaction_items
      WHERE transaction_id = $1
      ORDER BY id
    `, [id]);

    // Combine transaction with its items
    const fullTransaction = {
      ...transaction,
      items: itemsResult.rows
    };

    res.json(fullTransaction);
  } catch (error) {
    console.error(`Error getting transaction with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get transaction' });
  }
};

/**
 * Create a new transaction
 */
const createTransaction = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const {
      customerId, subtotal, tax, discount, total,
      paymentMethod, paymentStatus, amountPaid, changeAmount,
      notes, createdBy, items
    } = req.body;

    await client.query('BEGIN');

    // Generate transaction ID
    const transactionId = uuidv4();
    
    // Insert transaction and return generated invoice_no via DB default sequence
    const insertTxnResult = await client.query(`
      INSERT INTO transactions (
        id, invoice_no, customer_id, subtotal, tax, discount, total,
        payment_method, payment_status, amount_paid, change_amount,
        notes, created_by, created_at
      ) VALUES ($1, DEFAULT, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING invoice_no
    `, [
      transactionId,
      customerId || null,
      subtotal,
      tax || 0,
      discount || 0,
      total,
      paymentMethod,
      paymentStatus,
      amountPaid || 0,
      changeAmount || 0,
      notes,
      createdBy || 'system'
    ]);

    // Insert transaction items and update inventory batches
    if (items && items.length > 0) {
      for (const item of items) {
        // Generate item ID
        const itemId = uuidv4();
        
        // Insert transaction item
        await client.query(`
          INSERT INTO transaction_items (
            id, transaction_id, inventory_item_id,
            name, sku, price, quantity, unit, uom_display_name,
            conversion_factor, discount, subtotal, tax, total,
            cost_price, notes, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
        `, [
          itemId,
          transactionId,
          item.inventoryItemId,
          item.name,
          item.sku,
          item.price,
          item.quantity,
          item.unit || 'piece',
          item.uomDisplayName || item.unit || 'piece',
          item.conversionFactor || 1,
          item.discount || 0,
          item.subtotal,
          item.tax || 0,
          item.total,
          item.costPrice || 0,
          item.notes
        ]);

        // Process inventory movements for this item if it's a sale
        if (paymentStatus !== 'quote' && item.inventoryItemId) {
          const actualQuantity = item.quantity * (item.conversionFactor || 1);
          
          // Create inventory movement record
          const movementId = uuidv4();
          
          await client.query(`
            INSERT INTO inventory_movements (
              id, inventory_item_id, movement_type, quantity,
              unit_of_measure, conversion_factor, actual_quantity,
              reason, reference, performed_by, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          `, [
            movementId,
            item.inventoryItemId,
            'sale',
            item.quantity,
            item.unit || 'piece',
            item.conversionFactor || 1,
            actualQuantity,
            'Sale transaction',
            transactionId,
            createdBy || 'system'
          ]);
          
          // Update inventory batches using FIFO if it's a sale
          // This is a simplified version - in a real system you'd implement proper FIFO logic
          // by selecting batches ordered by expiry date and received date
          if (actualQuantity > 0) {
            const batches = await client.query(`
              SELECT id, remaining_quantity
              FROM inventory_batches
              WHERE inventory_item_id = $1 AND remaining_quantity > 0
              ORDER BY 
                CASE WHEN expiry_date IS NULL THEN '9999-12-31'::date ELSE expiry_date END ASC,
                received_date ASC
            `, [item.inventoryItemId]);
            
            let remainingToDeduct = actualQuantity;
            
            for (const batch of batches.rows) {
              if (remainingToDeduct <= 0) break;
              
              const deductAmount = Math.min(batch.remaining_quantity, remainingToDeduct);
              remainingToDeduct -= deductAmount;
              
              await client.query(`
                UPDATE inventory_batches
                SET remaining_quantity = remaining_quantity - $1,
                    updated_at = NOW()
                WHERE id = $2
              `, [deductAmount, batch.id]);
              
              // Link this movement to the specific batch
              await client.query(`
                UPDATE inventory_movements
                SET inventory_batch_id = $1
                WHERE id = $2
              `, [batch.id, movementId]);
            }
          }
        }
      }
    }

    // If there's a customer and this affects their balance
    if (customerId && paymentStatus === 'credit') {
      await client.query(`
        UPDATE customers
        SET balance = balance + $1,
            updated_at = NOW()
        WHERE id = $2
      `, [total - amountPaid, customerId]);
    }

    await client.query('COMMIT');
    
    res.status(201).json({ 
      id: transactionId,
      invoiceNo: insertTxnResult.rows[0]?.invoice_no,
      message: 'Transaction created successfully' 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  } finally {
    client.release();
  }
};

/**
 * Get transactions by customer ID
 */
const getTransactionsByCustomerId = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        t.id, t.customer_id as "customerId", c.name as "customerName",
        t.subtotal, t.tax, t.discount, t.total, 
        t.payment_method as "paymentMethod", t.payment_status as "paymentStatus", 
        t.amount_paid as "amountPaid", t.change_amount as "changeAmount",
        t.notes, t.created_by as "createdBy", t.created_at as "createdAt",
        t.metadata
      FROM transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE t.customer_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [customerId, limit, offset]);

    res.json(result.rows);
  } catch (error) {
    console.error(`Error getting transactions for customer ID ${req.params.customerId}:`, error);
    res.status(500).json({ error: 'Failed to get customer transactions' });
  }
};

/**
 * Get transactions by date range
 */
const getTransactionsByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, limit = 100 } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    const result = await pool.query(`
      SELECT 
        t.id, t.customer_id as "customerId", c.name as "customerName",
        t.subtotal, t.tax, t.discount, t.total, 
        t.payment_method as "paymentMethod", t.payment_status as "paymentStatus", 
        t.amount_paid as "amountPaid", t.change_amount as "changeAmount",
        t.notes, t.created_by as "createdBy", t.created_at as "createdAt",
        t.metadata
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE DATE(t.created_at) BETWEEN $1::date AND $2::date
      ORDER BY t.created_at DESC
      LIMIT $3
    `, [startDate, endDate, limit]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting transactions by date range:', error);
    res.status(500).json({ error: 'Failed to get transactions by date range' });
  }
};

/**
 * Search transactions
 */
const searchTransactions = async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 50 } = req.query;
    
    const searchPattern = `%${query}%`;
    
    const result = await pool.query(`
      SELECT 
        t.id, t.customer_id as "customerId", c.name as "customerName",
        t.subtotal, t.tax, t.discount, t.total, 
        t.payment_method as "paymentMethod", t.payment_status as "paymentStatus", 
        t.amount_paid as "amountPaid", t.change_amount as "changeAmount",
        t.notes, t.created_by as "createdBy", t.created_at as "createdAt",
        t.metadata
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
      WHERE 
        t.id ILIKE $1 OR
        c.name ILIKE $1 OR
        ti.name ILIKE $1 OR
        ti.sku ILIKE $1 OR
        t.notes ILIKE $1
      GROUP BY t.id, c.name, c.id
      ORDER BY t.created_at DESC
      LIMIT $2
    `, [searchPattern, limit]);

    res.json(result.rows);
  } catch (error) {
    console.error(`Error searching transactions for "${req.params.query}":`, error);
    res.status(500).json({ error: 'Failed to search transactions' });
  }
};

module.exports = {
  getAllTransactions,
  getRecentTransactions,
  getTransactionById,
  createTransaction,
  getTransactionsByCustomerId,
  getTransactionsByDateRange,
  searchTransactions
};