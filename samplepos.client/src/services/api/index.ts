/**
 * API Services Index
 * 
 * Central export for all API service modules.
 * Use this to import API functions and hooks throughout the application.
 * 
 * @example
 * import { useCustomers, useMakePayment, useGenerateInvoice } from '@/services/api';
 */

// Day 3: Customer APIs
// Customer Accounts API (account management, deposits, payments, credit)
export * from './customerAccountsApi';

// Customers API (CRUD operations)
export * from './customersApi';

// Day 4: Payment & Document APIs
// Installments API (installment plans and payments)
export * from './installmentsApi';

// Payments API (payment recording, allocation, refunds)
export * from './paymentsApi';

// Documents API (invoice, receipt, credit note generation)
export * from './documentsApi';

// Reports API (aging, profitability, cash flow, AR summary)
export * from './reportsApi';

// Re-export namespaces for convenience
export { customerAccountsApi } from './customerAccountsApi';
export { customersApi } from './customersApi';
export { installmentsApi } from './installmentsApi';
export { paymentsApi } from './paymentsApi';
export { documentsApi } from './documentsApi';
export { reportsApi } from './reportsApi';
