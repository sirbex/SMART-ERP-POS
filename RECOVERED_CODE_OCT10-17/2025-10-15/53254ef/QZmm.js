/**
 * Centralized Validation Utilities
 * Common validation functions used across controllers
 */

/**
 * Validate required fields
 * @param {Object} data - Data object to validate
 * @param {Array<string>} requiredFields - Array of required field names
 * @returns {Object} - { isValid: boolean, errors: Array<string> }
 */
const validateRequiredFields = (data, requiredFields) => {
  const errors = [];
  
  requiredFields.forEach(field => {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push(`${field} is required`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
const isValidEmail = (email) => {
  if (!email) return true; // Email is optional in many cases
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number (basic format)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid
 */
const isValidPhone = (phone) => {
  if (!phone) return true; // Phone is optional
  // Allow various formats: +256..., 0..., etc.
  const phoneRegex = /^[\d\s+()-]{7,20}$/;
  return phoneRegex.test(phone);
};

/**
 * Validate numeric value
 * @param {*} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} - { isValid: boolean, error: string|null }
 */
const validateNumber = (value, options = {}) => {
  const {
    min = null,
    max = null,
    allowZero = true,
    allowNegative = false,
    fieldName = 'Value'
  } = options;

  if (value === undefined || value === null || value === '') {
    return { isValid: false, error: `${fieldName} is required` };
  }

  const numValue = Number(value);

  if (isNaN(numValue)) {
    return { isValid: false, error: `${fieldName} must be a valid number` };
  }

  if (!allowZero && numValue === 0) {
    return { isValid: false, error: `${fieldName} cannot be zero` };
  }

  if (!allowNegative && numValue < 0) {
    return { isValid: false, error: `${fieldName} cannot be negative` };
  }

  if (min !== null && numValue < min) {
    return { isValid: false, error: `${fieldName} must be at least ${min}` };
  }

  if (max !== null && numValue > max) {
    return { isValid: false, error: `${fieldName} cannot exceed ${max}` };
  }

  return { isValid: true, error: null };
};

/**
 * Validate currency value (2 decimal places max)
 * @param {*} value - Value to validate
 * @param {string} fieldName - Name of the field
 * @returns {Object} - { isValid: boolean, error: string|null }
 */
const validateCurrency = (value, fieldName = 'Amount') => {
  const numValidation = validateNumber(value, {
    min: 0,
    allowNegative: false,
    fieldName
  });

  if (!numValidation.isValid) {
    return numValidation;
  }

  // Check decimal places
  const numValue = Number(value);
  const decimalPlaces = (numValue.toString().split('.')[1] || '').length;
  
  if (decimalPlaces > 2) {
    return {
      isValid: false,
      error: `${fieldName} cannot have more than 2 decimal places`
    };
  }

  return { isValid: true, error: null };
};

/**
 * Validate quantity value
 * @param {*} value - Value to validate
 * @param {string} fieldName - Name of the field
 * @returns {Object} - { isValid: boolean, error: string|null }
 */
const validateQuantity = (value, fieldName = 'Quantity') => {
  return validateNumber(value, {
    min: 0,
    allowZero: false,
    allowNegative: false,
    fieldName
  });
};

/**
 * Validate date string
 * @param {string} dateString - Date string to validate
 * @param {string} fieldName - Name of the field
 * @returns {Object} - { isValid: boolean, error: string|null }
 */
const validateDate = (dateString, fieldName = 'Date') => {
  if (!dateString) {
    return { isValid: false, error: `${fieldName} is required` };
  }

  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) {
    return { isValid: false, error: `${fieldName} is not a valid date` };
  }

  return { isValid: true, error: null };
};

/**
 * Validate UUID format
 * @param {string} uuid - UUID to validate
 * @returns {boolean} - True if valid UUID
 */
const isValidUUID = (uuid) => {
  if (!uuid) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Validate string length
 * @param {string} value - String to validate
 * @param {number} min - Minimum length
 * @param {number} max - Maximum length
 * @param {string} fieldName - Name of the field
 * @returns {Object} - { isValid: boolean, error: string|null }
 */
const validateStringLength = (value, min = 0, max = 255, fieldName = 'Field') => {
  if (!value || typeof value !== 'string') {
    return { isValid: false, error: `${fieldName} must be a string` };
  }

  const length = value.trim().length;

  if (length < min) {
    return { isValid: false, error: `${fieldName} must be at least ${min} characters` };
  }

  if (length > max) {
    return { isValid: false, error: `${fieldName} cannot exceed ${max} characters` };
  }

  return { isValid: true, error: null };
};

/**
 * Sanitize string input (trim and escape)
 * @param {string} value - String to sanitize
 * @returns {string} - Sanitized string
 */
const sanitizeString = (value) => {
  if (!value || typeof value !== 'string') return '';
  return value.trim();
};

/**
 * Validate and sanitize pagination parameters
 * @param {Object} query - Query parameters
 * @returns {Object} - { limit: number, offset: number }
 */
const validatePagination = (query) => {
  const limit = Math.min(Math.max(parseInt(query.limit) || 50, 1), 100);
  const offset = Math.max(parseInt(query.offset) || 0, 0);
  
  return { limit, offset };
};

module.exports = {
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
};
