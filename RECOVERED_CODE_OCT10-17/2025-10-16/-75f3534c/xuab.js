/**
 * Customer Controller
 */

const { pool } = require('../db/pool');
const { v4: uuidv4 } = require('uuid');

/**
 * Get all customers
 */
const getAllCustomers = async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        id, name, email, phone, address, is_active as "isActive",
        balance, metadata, created_at as "createdAt", updated_at as "updatedAt"
      FROM customers
      ORDER BY name
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting customers:', error);
    res.status(500).json({ error: 'Failed to get customers' });
  }
};

/**
 * Get a customer by ID
 */
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id, name, email, phone, address, is_active as "isActive",
        balance, metadata, created_at as "createdAt", updated_at as "updatedAt"
      FROM customers
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(`Error getting customer with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get customer' });
  }
};

/**
 * Create a new customer
 */
const createCustomer = async (req, res) => {
  try {
    const {
      name, email, phone, address, isActive, balance, metadata
    } = req.body;

    // Generate UUID for customer ID
    const customerId = uuidv4();
    
    const result = await pool.query(`
      INSERT INTO customers (
        id, name, email, phone, address, is_active,
        balance, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id
    `, [
      customerId,
      name,
      email || null,
      phone || null,
      address || null,
      isActive !== false,
      balance || 0,
      metadata ? JSON.stringify(metadata) : '{}'
    ]);

    res.status(201).json({ 
      id: result.rows[0].id,
      message: 'Customer created successfully' 
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
};

/**
 * Update a customer
 */
const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, address, isActive, balance, metadata
    } = req.body;

    // Check if customer exists
    const customerCheck = await pool.query(
      'SELECT id FROM customers WHERE id = $1',
      [id]
    );

    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    await pool.query(`
      UPDATE customers SET
        name = $1,
        email = $2,
        phone = $3,
        address = $4,
        is_active = $5,
        balance = $6,
        metadata = $7,
        updated_at = NOW()
      WHERE id = $8
    `, [
      name,
      email || null,
      phone || null,
      address || null,
      isActive !== false,
      balance || 0,
      metadata ? JSON.stringify(metadata) : '{}',
      id
    ]);

    res.json({ 
      id,
      message: 'Customer updated successfully' 
    });
  } catch (error) {
    console.error(`Error updating customer with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
};

/**
 * Delete a customer
 */
const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if there are any transactions for this customer
    const transactionsCheck = await pool.query(
      'SELECT COUNT(*) FROM transactions WHERE customer_id = $1',
      [id]
    );

    // If there are transactions, perform a soft delete
    if (parseInt(transactionsCheck.rows[0].count) > 0) {
      await pool.query(`
        UPDATE customers SET
          is_active = false,
          updated_at = NOW()
        WHERE id = $1
      `, [id]);
      
      return res.json({ 
        id,
        message: 'Customer deactivated successfully (has transaction history)' 
      });
    }
    
    // Otherwise perform a hard delete
    const result = await pool.query(`
      DELETE FROM customers
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ 
      id,
      message: 'Customer deleted successfully' 
    });
  } catch (error) {
    console.error(`Error deleting customer with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
};

/**
 * Search customers
 */
const searchCustomers = async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 50 } = req.query;
    
    const searchPattern = `%${query}%`;
    
    const result = await pool.query(`
      SELECT 
        id, name, email, phone, address, is_active as "isActive",
        balance, metadata, created_at as "createdAt", updated_at as "updatedAt"
      FROM customers
      WHERE 
        name ILIKE $1 OR
        email ILIKE $1 OR
        phone ILIKE $1 OR
        address ILIKE $1
      ORDER BY name
      LIMIT $2
    `, [searchPattern, limit]);

    res.json(result.rows);
  } catch (error) {
    console.error(`Error searching customers for "${req.params.query}":`, error);
    res.status(500).json({ error: 'Failed to search customers' });
  }
};

/**
 * Get transactions for a customer
 */
const getCustomerTransactions = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    // First verify the customer exists
    const customerCheck = await pool.query(
      'SELECT id FROM customers WHERE id = $1',
      [id]
    );

    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    const result = await pool.query(`
      SELECT 
        t.id, t.customer_id as "customerId",
        t.subtotal, t.tax, t.discount, t.total, 
        t.payment_method as "paymentMethod", t.payment_status as "paymentStatus", 
        t.amount_paid as "amountPaid", t.change_amount as "changeAmount",
        t.notes, t.created_by as "createdBy", t.created_at as "createdAt",
        t.metadata
      FROM transactions t
      WHERE t.customer_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset]);

    res.json(result.rows);
  } catch (error) {
    console.error(`Error getting transactions for customer ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get customer transactions' });
  }
};

/**
 * Update customer balance
 */
const updateCustomerBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type, notes } = req.body;
    
    if (!amount || !type) {
      return res.status(400).json({ error: 'Amount and type are required' });
    }
    
    if (!['credit', 'payment', 'adjustment'].includes(type)) {
      return res.status(400).json({ error: 'Invalid balance adjustment type' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current customer data
      const customerResult = await client.query(
        'SELECT balance FROM customers WHERE id = $1',
        [id]
      );
      
      if (customerResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      const currentBalance = parseFloat(customerResult.rows[0].balance);
      let newBalance = currentBalance;
      
      // Update balance based on type
      if (type === 'credit') {
        // Increase customer debt
        newBalance = currentBalance + parseFloat(amount);
      } else if (type === 'payment') {
        // Customer makes a payment
        newBalance = currentBalance - parseFloat(amount);
      } else if (type === 'adjustment') {
        // Direct adjustment to a specific value
        newBalance = parseFloat(amount);
      }
      
      // Update customer balance
      await client.query(`
        UPDATE customers SET
          balance = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [newBalance, id]);
      
      // Create payment record if it's a payment
      if (type === 'payment' && parseFloat(amount) > 0) {
        const paymentId = uuidv4();
        
        await client.query(`
          INSERT INTO payments (
            id, receipt_no, customer_id, transaction_id, amount, 
            payment_method, notes, created_at
          ) VALUES ($1, DEFAULT, $2, NULL, $3, 'cash', $4, NOW())
        `, [
          paymentId,
          id,
          parseFloat(amount),
          notes || 'Balance payment'
        ]);
      }
      
      await client.query('COMMIT');
      
      res.json({ 
        id,
        previousBalance: currentBalance,
        newBalance: newBalance,
        adjustment: parseFloat(amount),
        type,
        message: 'Customer balance updated successfully' 
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error updating balance for customer ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update customer balance' });
  }
};

module.exports = {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  searchCustomers,
  getCustomerTransactions,
  updateCustomerBalance
};