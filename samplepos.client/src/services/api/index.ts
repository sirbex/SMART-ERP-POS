/**
 * API Services Index
 * 
 * Central export for all API service modules.
 * Use this to import API functions and hooks throughout the application.
 * 
 * @example
 * import { useCustomers, useMakePayment } from '@/services/api';
 */

// Customer Accounts API (account management, deposits, payments, credit)
export * from './customerAccountsApi';

// Customers API (CRUD operations)
export * from './customersApi';

// Re-export namespaces for convenience
export { customerAccountsApi } from './customerAccountsApi';
export { customersApi } from './customersApi';
