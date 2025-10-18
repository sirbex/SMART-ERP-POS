import { Router } from 'express';
import pool from '../db/pool';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Get all customers
 */
router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        customer_id,
        first_name,
        last_name,
        phone_number,
        email,
        balance,
        created_at,
        updated_at
      FROM customers
      ORDER BY last_name, first_name
      LIMIT 100
    `);
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching customers:', error);
    next(error);
  }
});

/**
 * Get customer by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        customer_id,
        first_name,
        last_name,
        phone_number,
        email,
        balance,
        created_at,
        updated_at
      FROM customers
      WHERE customer_id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
        errors: [`Customer with ID ${id} does not exist`]
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching customer by ID:', error);
    next(error);
  }
});

/**
 * Create a new customer
 */
router.post('/', async (req, res, next) => {
  try {
    const { first_name, last_name, phone_number, email } = req.body;
    
    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        errors: ['First name and last name are required']
      });
    }
    
    const result = await pool.query(`
      INSERT INTO customers (first_name, last_name, phone_number, email)
      VALUES ($1, $2, $3, $4)
      RETURNING customer_id, first_name, last_name, phone_number, email, balance, created_at, updated_at
    `, [first_name, last_name, phone_number, email]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating customer:', error);
    next(error);
  }
});

/**
 * Update a customer
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, phone_number, email } = req.body;
    
    const result = await pool.query(`
      UPDATE customers
      SET 
        first_name = $1,
        last_name = $2,
        phone_number = $3,
        email = $4,
        updated_at = NOW()
      WHERE customer_id = $5
      RETURNING customer_id, first_name, last_name, phone_number, email, balance, created_at, updated_at
    `, [first_name, last_name, phone_number, email, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
        errors: [`Customer with ID ${id} does not exist`]
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating customer:', error);
    next(error);
  }
});

/**
 * Delete a customer
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      DELETE FROM customers
      WHERE customer_id = $1
      RETURNING customer_id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
        errors: [`Customer with ID ${id} does not exist`]
      });
    }
    
    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    logger.error('Error deleting customer:', error);
    next(error);
  }
});

export default router;