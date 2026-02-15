// Shared error messages for consistent user experience across the application

export const ERROR_MESSAGES = {
  // Form validation errors
  REQUIRED_FIELDS_MISSING: 'Please fill in all required fields',
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_PHONE: 'Please enter a valid phone number',
  INVALID_DATE: 'Please select a valid date',

  // API/Network errors
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  SERVER_ERROR: 'Server error. Please try again later.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',

  // Data loading errors
  FAILED_TO_LOAD_DATA: 'Failed to load data',
  FAILED_TO_SAVE_DATA: 'Failed to save data',
  FAILED_TO_DELETE_DATA: 'Failed to delete data',

  // Specific accounting errors
  FAILED_TO_LOAD_INVOICES: 'Failed to load invoices',
  FAILED_TO_LOAD_PAYMENTS: 'Failed to load payments',
  FAILED_TO_LOAD_CUSTOMERS: 'Failed to load customers',
  FAILED_TO_LOAD_SUPPLIERS: 'Failed to load suppliers',
  FAILED_TO_CREATE_INVOICE: 'Failed to create invoice',
  FAILED_TO_CREATE_PAYMENT: 'Failed to create payment',
  FAILED_TO_UPDATE_INVOICE: 'Failed to update invoice',
  FAILED_TO_DELETE_INVOICE: 'Failed to delete invoice',
} as const;

export const SUCCESS_MESSAGES = {
  // General success messages
  DATA_SAVED: 'Data saved successfully',
  DATA_DELETED: 'Data deleted successfully',

  // Specific accounting success messages
  INVOICE_CREATED: 'Invoice created successfully',
  PAYMENT_CREATED: 'Payment created successfully',
  INVOICE_UPDATED: 'Invoice updated successfully',
  INVOICE_DELETED: 'Invoice deleted successfully',
  PAYMENT_ALLOCATED: 'Payment allocated successfully',
  BILL_CREATED: 'Bill created successfully',
} as const;