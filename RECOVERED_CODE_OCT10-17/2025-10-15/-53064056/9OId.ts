/**
 * Frontend Utilities Index
 * Centralized exports for all shared utilities
 */

// API Client
export {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  apiGetPaginated,
  apiSearch,
  apiBatch,
  apiUpload,
  checkApiHealth,
  handleApiError,
  type ApiResponse,
  type PaginatedResponse
} from './apiClient';

// Validation utilities are exported from hooks
export {
  useFormValidation,
  CommonValidations,
  getFirstError,
  hasFieldError,
  type ValidationRule,
  type ValidationSchema,
  type FormErrors,
  type UseFormValidationResult
} from '../hooks/useFormValidation';
