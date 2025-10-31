/**
 * Transaction Controller - Refactored
 * Demonstrates usage of centralized utilities
 */

const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/pool');
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
  validateCurrency,
  validatePagination
} = require('../utils/validation');
const { count } = require('../utils/dbHelpers');

/**
 * Get all transactions with pagination
 */
const getAllTransactions = asyncHandler(async (req, res) => {
  const { limit, offset } = validatePagination(req.query);

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
    ORDER BY t.created_at DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  const totalCount = await count('transactions');

  sendPaginated(res, result.rows, totalCount, offset / limit + 1, limit);
});

/**
 * Get recent transactions
 */
const getRecentTransactions = asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;

  const result = await pool.query(`
    SELECT 
      t.id, t.customer_id as "customerId", c.name as "customerName",
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

  sendSuccess(res, result.rows);
});

/**
 * Get transaction by ID with items
 */
const getTransactionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get transaction details
  const transactionResult = await pool.query(`
    SELECT 
      t.id, t.customer_id as "customerId", c.name as "customerName",
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
    return sendNotFound(res, 'Transaction');
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

  // Combine transaction with items
  const fullTransaction = {
    ...transaction,
    items: itemsResult.rows
  };

  sendSuccess(res, fullTransaction);
});

/**
 * Create a new transaction
 */
const createTransaction = asyncHandler(async (req, res) => {
  const {
    customerId, subtotal, tax, discount, total,
    paymentMethod, paymentStatus, amountPaid, changeAmount,
    notes, createdBy, items
  } = req.body;

  // Validate required fields
  const validation = validateRequiredFields(req.body, [
    'subtotal', 'total', 'paymentMethod', 'paymentStatus'
  ]);
  if (!validation.isValid) {
    return sendValidationError(res, validation.errors);
  }

  // Validate amounts
  const validations = [
    validateCurrency(subtotal, 'Subtotal'),
    validateCurrency(total, 'Total'),
    validateCurrency(tax, 'Tax'),
    validateCurrency(discount, 'Discount')
  ];

  const errors = validations
    .filter(v => !v.isValid)
    .map(v => v.error);

  if (errors.length > 0) {
    return sendValidationError(res, errors);
  }

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    return sendValidationError(res, 'At least one item is required');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Generate transaction ID
    const transactionId = uuidv4();

    // Insert transaction
    await client.query(`
      INSERT INTO transactions (
        id, customer_id, subtotal, tax, discount, total,
        payment_method, payment_status, amount_paid, change_amount,
        notes, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
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

    // Insert transaction items
    for (const item of items) {
      const itemId = uuidv4();

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

      // Process inventory movements for sales
      if (paymentStatus !== 'quote' && item.inventoryItemId) {
        const actualQuantity = item.quantity * (item.conversionFactor || 1);
        const movementId = uuidv4();

        await client.query(`
          INSERT INTO inventory_movements (
            id, inventory_item_id, movement_type, quantity,
            unit_of_measure, conversion_factor, actual_quantity,
            reference, performed_by, created_at
          ) VALUES ($1, $2, 'sale', $3, $4, $5, $6, $7, $8, NOW())
        `, [
          movementId,
          item.inventoryItemId,
          item.quantity,
          item.unit || 'piece',
          item.conversionFactor || 1,
          actualQuantity,
          transactionId,
          createdBy || 'system'
        ]);

        // Update inventory batches (FIFO deduction)
        await deductInventoryFIFO(client, item.inventoryItemId, actualQuantity);
      }
    }

    await client.query('COMMIT');

    sendCreated(res, { id: transactionId }, 'Transaction created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

/**
 * Get transactions by customer ID
 */
const getTransactionsByCustomerId = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { limit, offset } = validatePagination(req.query);

  const result = await pool.query(`
    SELECT 
      t.id, t.customer_id as "customerId", t.subtotal, t.tax, t.discount, t.total,
      t.payment_method as "paymentMethod", t.payment_status as "paymentStatus",
      t.created_at as "createdAt", t.notes
    FROM transactions t
    WHERE t.customer_id = $1
    ORDER BY t.created_at DESC
    LIMIT $2 OFFSET $3
  `, [customerId, limit, offset]);

  const totalCount = await count('transactions', 'customer_id = $1', [customerId]);

  sendPaginated(res, result.rows, totalCount, offset / limit + 1, limit);
});

/**
 * FIFO inventory deduction helper
 */
async function deductInventoryFIFO(client, inventoryItemId, quantityToDeduct) {
  let remainingQuantity = quantityToDeduct;

  // Get batches ordered by FIFO (oldest first with expiry consideration)
  const batches = await client.query(`
    SELECT id, remaining_quantity
    FROM inventory_batches
    WHERE inventory_item_id = $1 
      AND remaining_quantity > 0
    ORDER BY 
      CASE WHEN expiry_date IS NOT NULL THEN expiry_date END ASC,
      received_date ASC
  `, [inventoryItemId]);

  for (const batch of batches.rows) {
    if (remainingQuantity <= 0) break;

    const deductFromBatch = Math.min(batch.remaining_quantity, remainingQuantity);
    const newRemaining = batch.remaining_quantity - deductFromBatch;

    await client.query(`
      UPDATE inventory_batches
      SET remaining_quantity = $1, updated_at = NOW()
      WHERE id = $2
    `, [newRemaining, batch.id]);

    remainingQuantity -= deductFromBatch;
  }

  if (remainingQuantity > 0) {
    throw new Error('Insufficient inventory quantity');
  }
}

module.exports = {
  getAllTransactions,
  getRecentTransactions,
  getTransactionById,
  createTransaction,
  getTransactionsByCustomerId
};
