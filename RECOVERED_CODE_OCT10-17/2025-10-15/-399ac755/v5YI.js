/**
 * Customer Controller - Refactored
 * Uses centralized utilities to eliminate code duplication
 */

const { v4: uuidv4 } = require('uuid');
const {
  sendSuccess,
  sendCreated,
  sendNotFound,
  sendValidationError,
  sendPaginated
} = require('../utils/responseFormatter');
const { handleControllerError, asyncHandler } = require('../utils/errorHandler');
const {
  validateRequiredFields,
  isValidEmail,
  isValidPhone,
  validatePagination
} = require('../utils/validation');
const {
  getAll,
  getById,
  create,
  updateById,
  deleteById,
  search,
  count
} = require('../utils/dbHelpers');
const { pool } = require('../db/pool');

/**
 * Get all customers with pagination
 */
const getAllCustomers = asyncHandler(async (req, res) => {
  const { limit, offset } = validatePagination(req.query);

  // Get customers
  const customers = await pool.query(`
    SELECT 
      id, name, email, phone, address, is_active as "isActive",
      balance, metadata, created_at as "createdAt", updated_at as "updatedAt"
    FROM customers
    WHERE is_active = true
    ORDER BY name
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  // Get total count
  const totalCount = await count('customers', 'is_active = true');

  sendPaginated(res, customers.rows, totalCount, offset / limit + 1, limit);
});

/**
 * Get a customer by ID
 */
const getCustomerById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(`
    SELECT 
      id, name, email, phone, address, is_active as "isActive",
      balance, metadata, created_at as "createdAt", updated_at as "updatedAt"
    FROM customers
    WHERE id = $1
  `, [id]);

  if (result.rows.length === 0) {
    return sendNotFound(res, 'Customer');
  }

  sendSuccess(res, result.rows[0]);
});

/**
 * Create a new customer
 */
const createCustomer = asyncHandler(async (req, res) => {
  const { name, email, phone, address, isActive, balance, metadata } = req.body;

  // Validate required fields
  const validation = validateRequiredFields(req.body, ['name']);
  if (!validation.isValid) {
    return sendValidationError(res, validation.errors);
  }

  // Validate email format
  if (email && !isValidEmail(email)) {
    return sendValidationError(res, 'Invalid email format');
  }

  // Validate phone format
  if (phone && !isValidPhone(phone)) {
    return sendValidationError(res, 'Invalid phone number format');
  }

  // Generate UUID for customer ID
  const customerId = uuidv4();

  const result = await pool.query(`
    INSERT INTO customers (
      id, name, email, phone, address, is_active,
      balance, metadata, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    RETURNING id, name, email, phone, address, is_active as "isActive", balance, metadata
  `, [
    customerId,
    name.trim(),
    email ? email.trim() : null,
    phone ? phone.trim() : null,
    address ? address.trim() : null,
    isActive !== false,
    balance || 0,
    metadata ? JSON.stringify(metadata) : '{}'
  ]);

  sendCreated(res, result.rows[0], 'Customer created successfully');
});

/**
 * Update a customer
 */
const updateCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, address, isActive, metadata } = req.body;

  // Check if customer exists
  const exists = await getById('customers', id);
  if (!exists) {
    return sendNotFound(res, 'Customer');
  }

  // Validate email if provided
  if (email && !isValidEmail(email)) {
    return sendValidationError(res, 'Invalid email format');
  }

  // Validate phone if provided
  if (phone && !isValidPhone(phone)) {
    return sendValidationError(res, 'Invalid phone number format');
  }

  const result = await pool.query(`
    UPDATE customers
    SET 
      name = COALESCE($1, name),
      email = COALESCE($2, email),
      phone = COALESCE($3, phone),
      address = COALESCE($4, address),
      is_active = COALESCE($5, is_active),
      metadata = COALESCE($6, metadata),
      updated_at = NOW()
    WHERE id = $7
    RETURNING id, name, email, phone, address, is_active as "isActive", balance, metadata
  `, [
    name ? name.trim() : null,
    email ? email.trim() : null,
    phone ? phone.trim() : null,
    address ? address.trim() : null,
    isActive !== undefined ? isActive : null,
    metadata ? JSON.stringify(metadata) : null,
    id
  ]);

  sendSuccess(res, result.rows[0], 'Customer updated successfully');
});

/**
 * Delete a customer (soft delete)
 */
const deleteCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if customer exists
  const exists = await getById('customers', id);
  if (!exists) {
    return sendNotFound(res, 'Customer');
  }

  // Soft delete
  await updateById('customers', id, { is_active: false });

  sendSuccess(res, null, 'Customer deleted successfully');
});

/**
 * Search customers
 */
const searchCustomers = asyncHandler(async (req, res) => {
  const { query } = req.params;
  const { limit = 50 } = req.query;

  if (!query || query.trim().length < 2) {
    return sendValidationError(res, 'Search query must be at least 2 characters');
  }

  const results = await search(
    'customers',
    ['name', 'email', 'phone'],
    query.trim(),
    parseInt(limit)
  );

  sendSuccess(res, results);
});

/**
 * Get customer transactions
 */
const getCustomerTransactions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit, offset } = validatePagination(req.query);

  // Check if customer exists
  const exists = await getById('customers', id);
  if (!exists) {
    return sendNotFound(res, 'Customer');
  }

  const result = await pool.query(`
    SELECT 
      t.id, t.customer_id as "customerId", t.subtotal, t.tax, t.discount, t.total,
      t.payment_method as "paymentMethod", t.payment_status as "paymentStatus",
      t.created_at as "createdAt", t.notes
    FROM transactions t
    WHERE t.customer_id = $1
    ORDER BY t.created_at DESC
    LIMIT $2 OFFSET $3
  `, [id, limit, offset]);

  const totalCount = await count('transactions', 'customer_id = $1', [id]);

  sendPaginated(res, result.rows, totalCount, offset / limit + 1, limit);
});

/**
 * Update customer balance
 */
const updateCustomerBalance = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, operation = 'add' } = req.body;

  // Validate amount
  if (amount === undefined || isNaN(amount)) {
    return sendValidationError(res, 'Valid amount is required');
  }

  // Check if customer exists
  const customer = await getById('customers', id);
  if (!customer) {
    return sendNotFound(res, 'Customer');
  }

  const currentBalance = parseFloat(customer.balance) || 0;
  const newBalance = operation === 'add' 
    ? currentBalance + parseFloat(amount)
    : currentBalance - parseFloat(amount);

  const result = await pool.query(`
    UPDATE customers
    SET balance = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING id, name, balance
  `, [newBalance, id]);

  sendSuccess(res, result.rows[0], 'Customer balance updated successfully');
});

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
