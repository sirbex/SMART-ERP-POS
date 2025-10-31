/**
 * Inventory Controller with Pagination Support
 * 
 * Enhanced version of inventory controller with pagination, search, and optimized queries
 */

const { pool } = require('../db/pool');
const { getPaginationParams, formatPaginatedResponse, buildSearchCondition } = require('../utils/paginationHelper');
const { sendSuccess, sendError, sendNotFound, sendCreated, sendValidationError } = require('../utils/responseFormatter');
const { asyncHandler } = require('../utils/errorHandler');

/**
 * Get all inventory items with pagination
 * GET /api/inventory?page=1&limit=20&search=product&sortBy=name&sortOrder=ASC
 */
const getAllInventoryItemsPaginated = asyncHandler(async (req, res) => {
  const { page, limit, offset, search, sortBy, sortOrder } = getPaginationParams(req);

  // Build search condition
  let searchCondition = '';
  let queryParams = [];
  
  if (search) {
    searchCondition = `AND (i.name ILIKE $1 OR i.sku ILIKE $1 OR i.category ILIKE $1)`;
    queryParams.push(`%${search}%`);
  }

  // Validate sortBy to prevent SQL injection
  const allowedSortFields = ['name', 'sku', 'category', 'base_price', 'created_at', 'updated_at'];
  const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'name';

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM inventory_items i
    WHERE i.is_active = true
    ${searchCondition}
  `;
  
  const countResult = await pool.query(countQuery, queryParams);
  const total = parseInt(countResult.rows[0].total);

  // Get paginated items
  const itemsQuery = `
    SELECT 
      i.id, i.sku, i.name, i.description, i.category, 
      i.base_price as price, i.tax_rate as "taxRate", i.reorder_level as "reorderLevel",
      i.is_active as "isActive", i.metadata, i.created_at as "createdAt", 
      i.updated_at as "updatedAt"
    FROM inventory_items i
    WHERE i.is_active = true
    ${searchCondition}
    ORDER BY i.${safeSortBy} ${sortOrder}
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `;

  const itemsResult = await pool.query(itemsQuery, [...queryParams, limit, offset]);

  // Format the metadata field
  const items = itemsResult.rows.map(item => ({
    ...item,
    metadata: item.metadata || {},
    batch: item.metadata?.batch || '',
    hasExpiry: item.metadata?.hasExpiry || false,
    expiryAlertDays: item.metadata?.expiryAlertDays || 30,
    unit: item.metadata?.unit || 'piece'
  }));

  return sendSuccess(res, formatPaginatedResponse(items, total, page, limit));
});

/**
 * Get all inventory items (non-paginated, for backward compatibility)
 * GET /api/inventory/all
 */
const getAllInventoryItems = asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT 
      i.id, i.sku, i.name, i.description, i.category, 
      i.base_price as price, i.tax_rate as "taxRate", i.reorder_level as "reorderLevel",
      i.is_active as "isActive", i.metadata, i.created_at as "createdAt", 
      i.updated_at as "updatedAt"
    FROM inventory_items i
    WHERE i.is_active = true
    ORDER BY i.name
  `);

  const items = result.rows.map(item => ({
    ...item,
    metadata: item.metadata || {},
    batch: item.metadata?.batch || '',
    hasExpiry: item.metadata?.hasExpiry || false,
    expiryAlertDays: item.metadata?.expiryAlertDays || 30,
    unit: item.metadata?.unit || 'piece'
  }));

  return sendSuccess(res, items);
});

/**
 * Get inventory items with low stock (paginated)
 * GET /api/inventory/low-stock?page=1&limit=20
 */
const getLowStockItems = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req);

  // Get items where current stock is below reorder level
  const countQuery = `
    SELECT COUNT(DISTINCT i.id) as total
    FROM inventory_items i
    LEFT JOIN inventory_stock s ON s.inventory_item_id = i.id
    WHERE i.is_active = true
    GROUP BY i.id, i.reorder_level
    HAVING COALESCE(SUM(s.quantity), 0) <= i.reorder_level
  `;

  const countResult = await pool.query(countQuery);
  const total = countResult.rows.length;

  const itemsQuery = `
    SELECT 
      i.id, i.sku, i.name, i.category,
      i.base_price as price,
      i.reorder_level as "reorderLevel",
      COALESCE(SUM(s.quantity), 0) as "currentStock"
    FROM inventory_items i
    LEFT JOIN inventory_stock s ON s.inventory_item_id = i.id
    WHERE i.is_active = true
    GROUP BY i.id
    HAVING COALESCE(SUM(s.quantity), 0) <= i.reorder_level
    ORDER BY (i.reorder_level - COALESCE(SUM(s.quantity), 0)) DESC
    LIMIT $1 OFFSET $2
  `;

  const itemsResult = await pool.query(itemsQuery, [limit, offset]);

  return sendSuccess(res, formatPaginatedResponse(itemsResult.rows, total, page, limit));
});

/**
 * Search inventory items
 * GET /api/inventory/search?q=product&page=1&limit=20
 */
const searchInventoryItems = asyncHandler(async (req, res) => {
  const query = req.query.q || '';
  const { page, limit, offset } = getPaginationParams(req);

  if (!query) {
    return sendValidationError(res, 'Search query is required', { field: 'q' });
  }

  const searchPattern = `%${query}%`;

  // Count total matches
  const countQuery = `
    SELECT COUNT(*) as total
    FROM inventory_items i
    WHERE i.is_active = true
      AND (i.name ILIKE $1 OR i.sku ILIKE $1 OR i.description ILIKE $1 OR i.category ILIKE $1)
  `;
  
  const countResult = await pool.query(countQuery, [searchPattern]);
  const total = parseInt(countResult.rows[0].total);

  // Get matching items
  const itemsQuery = `
    SELECT 
      i.id, i.sku, i.name, i.description, i.category, 
      i.base_price as price, i.metadata
    FROM inventory_items i
    WHERE i.is_active = true
      AND (i.name ILIKE $1 OR i.sku ILIKE $1 OR i.description ILIKE $1 OR i.category ILIKE $1)
    ORDER BY 
      CASE 
        WHEN i.name ILIKE $1 THEN 1
        WHEN i.sku ILIKE $1 THEN 2
        ELSE 3
      END,
      i.name
    LIMIT $2 OFFSET $3
  `;

  const itemsResult = await pool.query(itemsQuery, [searchPattern, limit, offset]);

  const items = itemsResult.rows.map(item => ({
    ...item,
    metadata: item.metadata || {},
    unit: item.metadata?.unit || 'piece'
  }));

  return sendSuccess(res, formatPaginatedResponse(items, total, page, limit));
});

/**
 * Get inventory items by category (paginated)
 * GET /api/inventory/category/:category?page=1&limit=20
 */
const getInventoryByCategory = asyncHandler(async (req, res) => {
  const { category } = req.params;
  const { page, limit, offset, sortBy, sortOrder } = getPaginationParams(req);

  const allowedSortFields = ['name', 'base_price', 'created_at'];
  const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'name';

  // Count total items in category
  const countQuery = `
    SELECT COUNT(*) as total
    FROM inventory_items i
    WHERE i.is_active = true AND i.category = $1
  `;
  
  const countResult = await pool.query(countQuery, [category]);
  const total = parseInt(countResult.rows[0].total);

  // Get items in category
  const itemsQuery = `
    SELECT 
      i.id, i.sku, i.name, i.description, i.category, 
      i.base_price as price, i.tax_rate as "taxRate", 
      i.metadata, i.created_at as "createdAt"
    FROM inventory_items i
    WHERE i.is_active = true AND i.category = $1
    ORDER BY i.${safeSortBy} ${sortOrder}
    LIMIT $2 OFFSET $3
  `;

  const itemsResult = await pool.query(itemsQuery, [category, limit, offset]);

  const items = itemsResult.rows.map(item => ({
    ...item,
    metadata: item.metadata || {},
    unit: item.metadata?.unit || 'piece'
  }));

  return sendSuccess(res, formatPaginatedResponse(items, total, page, limit));
});

/**
 * Get all categories with item counts
 * GET /api/inventory/categories
 */
const getCategories = asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT 
      i.category,
      COUNT(*) as "itemCount"
    FROM inventory_items i
    WHERE i.is_active = true AND i.category IS NOT NULL
    GROUP BY i.category
    ORDER BY i.category
  `);

  return sendSuccess(res, result.rows);
});

module.exports = {
  getAllInventoryItemsPaginated,
  getAllInventoryItems,
  getLowStockItems,
  searchInventoryItems,
  getInventoryByCategory,
  getCategories
};
