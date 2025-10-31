/**
 * Backend Utilities Index
 * Centralized exports for all shared utilities
 */

// Response Formatters
const {
  sendSuccess,
  sendError,
  sendNotFound,
  sendValidationError,
  sendConflict,
  sendCreated,
  sendPaginated
} = require('./responseFormatter');

// Error Handlers
const {
  handleDatabaseError,
  handleControllerError,
  asyncHandler,
  errorMiddleware
} = require('./errorHandler');

// Validation Utilities
const {
  validateRequiredFields,
  isValidEmail,
  isValidPhone,
  validateNumber,
  validateCurrency,
  validateQuantity,
  validateDate,
  isValidUUID,
  validateStringLength,
  sanitizeString,
  validatePagination
} = require('./validation');

// Database Helpers
const {
  executeQuery,
  getById,
  getAll,
  create,
  updateById,
  deleteById,
  softDelete,
  count,
  exists,
  transaction,
  search,
  bulkInsert
} = require('./dbHelpers');

module.exports = {
  // Response Formatters
  sendSuccess,
  sendError,
  sendNotFound,
  sendValidationError,
  sendConflict,
  sendCreated,
  sendPaginated,
  
  // Error Handlers
  handleDatabaseError,
  handleControllerError,
  asyncHandler,
  errorMiddleware,
  
  // Validation
  validateRequiredFields,
  isValidEmail,
  isValidPhone,
  validateNumber,
  validateCurrency,
  validateQuantity,
  validateDate,
  isValidUUID,
  validateStringLength,
  sanitizeString,
  validatePagination,
  
  // Database
  executeQuery,
  getById,
  getAll,
  create,
  updateById,
  deleteById,
  softDelete,
  count,
  exists,
  transaction,
  search,
  bulkInsert
};
