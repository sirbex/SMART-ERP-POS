import { Router } from 'express';
import pool from '../db/pool';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Get all transactions with pagination
 */
router.get('/', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 1000;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const result = await pool.query(`
      SELECT 
        t.transaction_id,
        t.customer_id,
        c.first_name || ' ' || c.last_name AS customer_name,
        t.transaction_date,
        t.total_amount,
        t.payment_method,
        t.status,
        t.notes,
        COUNT(ti.item_id) AS item_count
      FROM 
        transactions t
      LEFT JOIN 
        customers c ON t.customer_id = c.customer_id
      LEFT JOIN 
        transaction_items ti ON t.transaction_id = ti.transaction_id
      GROUP BY 
        t.transaction_id, c.first_name, c.last_name
      ORDER BY 
        t.transaction_date DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching all transactions:', error);
    next(error);
  }
});

/**
 * Get recent transactions
 */
router.get('/recent', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    
    const result = await pool.query(`
      SELECT 
        t.transaction_id,
        t.customer_id,
        c.first_name || ' ' || c.last_name AS customer_name,
        t.transaction_date,
        t.total_amount,
        t.payment_method,
        t.status,
        COUNT(ti.item_id) AS item_count
      FROM 
        transactions t
      LEFT JOIN 
        customers c ON t.customer_id = c.customer_id
      LEFT JOIN 
        transaction_items ti ON t.transaction_id = ti.transaction_id
      GROUP BY 
        t.transaction_id, c.first_name, c.last_name
      ORDER BY 
        t.transaction_date DESC
      LIMIT $1
    `, [limit]);
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching recent transactions:', error);
    next(error);
  }
});

/**
 * Get transaction by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get transaction details
    const transactionResult = await pool.query(`
      SELECT 
        t.transaction_id,
        t.customer_id,
        c.first_name || ' ' || c.last_name AS customer_name,
        t.transaction_date,
        t.total_amount,
        t.payment_method,
        t.status,
        t.notes
      FROM 
        transactions t
      LEFT JOIN 
        customers c ON t.customer_id = c.customer_id
      WHERE 
        t.transaction_id = $1
    `, [id]);
    
    if (transactionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
        errors: [`Transaction with ID ${id} does not exist`]
      });
    }
    
    // Get transaction items
    const itemsResult = await pool.query(`
      SELECT 
        ti.item_id,
        p.product_name,
        ti.quantity,
        ti.unit_price,
        ti.discount,
        ti.subtotal
      FROM 
        transaction_items ti
      JOIN 
        products p ON ti.product_id = p.product_id
      WHERE 
        ti.transaction_id = $1
    `, [id]);
    
    const transaction = {
      ...transactionResult.rows[0],
      items: itemsResult.rows
    };
    
    res.json(transaction);
  } catch (error) {
    logger.error('Error fetching transaction by ID:', error);
    next(error);
  }
});

/**
 * Create a new transaction
 */
router.post('/', async (req, res, next) => {
  try {
    const { 
      customer_id, 
      items, 
      payment_method, 
      notes 
    } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction data',
        errors: ['Transaction must include at least one item']
      });
    }
    
    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Calculate total amount
      let total_amount = 0;
      for (const item of items) {
        total_amount += (item.quantity * item.unit_price) - item.discount;
      }
      
      // Insert transaction
      const transactionResult = await client.query(`
        INSERT INTO transactions 
          (customer_id, transaction_date, total_amount, payment_method, status, notes)
        VALUES 
          ($1, NOW(), $2, $3, 'completed', $4)
        RETURNING transaction_id, transaction_date
      `, [customer_id || null, total_amount, payment_method, notes || null]);
      
      const transaction_id = transactionResult.rows[0].transaction_id;
      
      // Insert transaction items
      for (const item of items) {
        const subtotal = (item.quantity * item.unit_price) - item.discount;
        
        await client.query(`
          INSERT INTO transaction_items 
            (transaction_id, product_id, quantity, unit_price, discount, subtotal)
          VALUES 
            ($1, $2, $3, $4, $5, $6)
        `, [
          transaction_id, 
          item.product_id, 
          item.quantity, 
          item.unit_price,
          item.discount || 0,
          subtotal
        ]);
        
        // Update inventory quantity
        await client.query(`
          UPDATE products
          SET quantity = quantity - $1
          WHERE product_id = $2
        `, [item.quantity, item.product_id]);
      }
      
      // If customer_id is provided, update customer balance
      if (customer_id) {
        await client.query(`
          UPDATE customers
          SET balance = balance + $1
          WHERE customer_id = $2
        `, [total_amount, customer_id]);
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({
        success: true,
        transaction_id,
        total_amount,
        message: 'Transaction completed successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Error creating transaction:', error);
    next(error);
  }
});

export default router;