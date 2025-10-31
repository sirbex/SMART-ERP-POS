/**
 * Centralized Error Handler Utility
 * Handles different types of errors consistently across the application
 */

const { sendError, sendConflict, sendValidationError } = require('./responseFormatter');

/**
 * Handle database errors (PostgreSQL specific)
 * @param {Object} error - Error object
 * @param {Object} res - Express response object
 * @returns {boolean} - True if error was handled, false otherwise
 */
const handleDatabaseError = (error, res) => {
  // PostgreSQL error codes
  switch (error.code) {
    case '23505': // Unique constraint violation
      const field = extractFieldFromError(error, 'unique constraint');
      const value = extractValueFromDetail(error.detail);
      return sendConflict(
        res,
        `A record with ${field || 'this value'} '${value}' already exists. Please use a different value.`,
        field
      );

    case '23503': // Foreign key constraint violation
      return sendError(res, 'Cannot complete operation due to related data constraints', 400);

    case '23502': // Not null constraint violation
      const notNullField = extractFieldFromError(error, 'not-null constraint');
      return sendValidationError(res, `${notNullField || 'Required field'} cannot be null`);

    case '22P02': // Invalid text representation
      return sendValidationError(res, 'Invalid data format provided');

    case '22001': // String data right truncation
      return sendValidationError(res, 'Data exceeds maximum allowed length');

    case '23514': // Check constraint violation
      return sendValidationError(res, 'Data does not meet validation requirements');

    default:
      return false; // Error not handled
  }
};

/**
 * Extract field name from PostgreSQL error
 * @param {Object} error - PostgreSQL error object
 * @param {string} constraintType - Type of constraint
 * @returns {string|null} - Field name or null
 */
const extractFieldFromError = (error, constraintType) => {
  if (error.constraint) {
    // Extract field name from constraint name (e.g., 'inventory_items_sku_key' -> 'sku')
    const parts = error.constraint.split('_');
    if (parts.length > 2) {
      return parts[parts.length - 2]; // Second to last part is usually the field
    }
  }
  
  if (error.column) {
    return error.column;
  }

  return null;
};

/**
 * Extract value from error detail
 * @param {string} detail - Error detail string
 * @returns {string} - Extracted value
 */
const extractValueFromDetail = (detail) => {
  if (!detail) return '';
  
  // Extract value from format: "Key (field)=(value) already exists"
  const match = detail.match(/\(([^)]+)\)=\(([^)]+)\)/);
  if (match && match[2]) {
    return match[2];
  }
  
  return '';
};

/**
 * Main error handler wrapper for controllers
 * @param {Object} error - Error object
 * @param {Object} res - Express response object
 * @param {string} context - Context of the error (e.g., 'creating customer')
 */
const handleControllerError = (error, res, context = 'processing request') => {
  console.error(`Error ${context}:`, error);

  // Try to handle database errors
  if (error.code && handleDatabaseError(error, res)) {
    return;
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors || {}).map(e => e.message);
    return sendValidationError(res, errors);
  }

  // Handle custom application errors
  if (error.status && error.message) {
    return sendError(res, error.message, error.status);
  }

  // Default server error
  return sendError(res, `Failed ${context}`, 500, {
    message: error.message
  });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} - Wrapped function with error handling
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Express error handling middleware
 * Should be added at the end of middleware chain
 */
const errorMiddleware = (err, req, res, next) => {
  handleControllerError(err, res, `processing ${req.method} ${req.path}`);
};

module.exports = {
  handleDatabaseError,
  handleControllerError,
  asyncHandler,
  errorMiddleware,
  extractFieldFromError,
  extractValueFromDetail
};
