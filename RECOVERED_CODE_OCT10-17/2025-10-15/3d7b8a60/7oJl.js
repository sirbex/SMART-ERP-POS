/**
 * Pagination Helper for Database Queries
 * 
 * Provides consistent pagination across all controllers
 */

/**
 * Extract and validate pagination parameters from request
 * @param {Object} req - Express request object
 * @returns {Object} Validated pagination params
 */
function getPaginationParams(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  
  // Optional search and sort
  const search = req.query.search || '';
  const sortBy = req.query.sortBy || 'createdAt';
  const sortOrder = (req.query.sortOrder || 'DESC').toUpperCase();

  return {
    page,
    limit,
    offset,
    search,
    sortBy,
    sortOrder: sortOrder === 'ASC' ? 'ASC' : 'DESC'
  };
}

/**
 * Format paginated response
 * @param {Array} data - Query results
 * @param {number} total - Total count
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} Formatted response
 */
function formatPaginatedResponse(data, total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  
  return {
    success: true,
    data,
    pagination: {
      currentPage: page,
      itemsPerPage: limit,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Build search condition for Sequelize
 * @param {string} search - Search query
 * @param {Array<string>} fields - Fields to search in
 * @returns {Object} Sequelize where condition
 */
function buildSearchCondition(search, fields) {
  if (!search || !fields || fields.length === 0) {
    return {};
  }

  const { Op } = require('sequelize');
  
  return {
    [Op.or]: fields.map(field => ({
      [field]: {
        [Op.iLike]: `%${search}%`
      }
    }))
  };
}

/**
 * Apply pagination to a Sequelize query
 * @param {Object} queryOptions - Sequelize query options
 * @param {Object} paginationParams - Pagination parameters
 * @returns {Object} Query options with pagination
 */
function applyPagination(queryOptions, paginationParams) {
  return {
    ...queryOptions,
    limit: paginationParams.limit,
    offset: paginationParams.offset,
    order: [[paginationParams.sortBy, paginationParams.sortOrder]]
  };
}

module.exports = {
  getPaginationParams,
  formatPaginatedResponse,
  buildSearchCondition,
  applyPagination
};
