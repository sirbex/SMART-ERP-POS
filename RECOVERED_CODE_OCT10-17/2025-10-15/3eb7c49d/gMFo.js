/**
 * Standard API Response Formatter
 * Ensures consistent response structure across all endpoints
 */

/**
 * Success response formatter
 * @param {Object} res - Express response object
 * @param {*} data - Data to send
 * @param {string} message - Optional success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
const sendSuccess = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

/**
 * Error response formatter
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {Object} details - Additional error details
 */
const sendError = (res, message = 'An error occurred', statusCode = 500, details = null) => {
  const response = {
    success: false,
    error: message,
    timestamp: new Date().toISOString()
  };

  if (details) {
    response.details = details;
  }

  return res.status(statusCode).json(response);
};

/**
 * Not found response formatter
 * @param {Object} res - Express response object
 * @param {string} resource - Name of the resource not found
 */
const sendNotFound = (res, resource = 'Resource') => {
  return res.status(404).json({
    success: false,
    error: `${resource} not found`,
    timestamp: new Date().toISOString()
  });
};

/**
 * Validation error response formatter
 * @param {Object} res - Express response object
 * @param {Array|string} errors - Validation errors
 */
const sendValidationError = (res, errors) => {
  const errorArray = Array.isArray(errors) ? errors : [errors];
  
  return res.status(400).json({
    success: false,
    error: 'Validation failed',
    errors: errorArray,
    timestamp: new Date().toISOString()
  });
};

/**
 * Conflict response formatter (e.g., duplicate entries)
 * @param {Object} res - Express response object
 * @param {string} message - Conflict message
 * @param {string} field - Field that has conflict
 */
const sendConflict = (res, message, field = null) => {
  const response = {
    success: false,
    error: 'Conflict',
    message,
    timestamp: new Date().toISOString()
  };

  if (field) {
    response.field = field;
  }

  return res.status(409).json(response);
};

/**
 * Created response formatter
 * @param {Object} res - Express response object
 * @param {*} data - Created resource data
 * @param {string} message - Success message
 */
const sendCreated = (res, data, message = 'Resource created successfully') => {
  return sendSuccess(res, data, message, 201);
};

/**
 * Paginated response formatter
 * @param {Object} res - Express response object
 * @param {Array} data - Array of items
 * @param {number} total - Total count
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 */
const sendPaginated = (res, data, total, page = 1, limit = 10) => {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit)
    },
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  sendSuccess,
  sendError,
  sendNotFound,
  sendValidationError,
  sendConflict,
  sendCreated,
  sendPaginated
};
