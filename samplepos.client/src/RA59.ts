/**
 * API Services Index
 *
 * Central export for all API service modules.
 * Use this to import API functions and hooks throughout the application.
 *
 * @example
 * import { useCustomers, useMakePayment, useGenerateInvoice, useProducts } from '@/services/api';
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

// Day 5: Inventory & Sales APIs
// Products API (product CRUD operations)
export * from './productsApi';

// Inventory API (stock management, batch tracking)
export * from './inventoryApi';

// Sales API (POS operations, sale recording)
export * from './salesApi';

// Purchases API (purchase orders, receiving)
export * from './purchasesApi';

// Suppliers API (supplier management)
export * from './suppliersApi';

// Supplier Payments API (AP payments)
export * from './supplierPaymentsApi';

// Settings API (application settings)
export * from './settingsApi';

// Re-export namespaces for convenience
export { customerAccountsApi } from './customerAccountsApi';
export { customersApi } from './customersApi';
export { installmentsApi } from './installmentsApi';
export { paymentsApi } from './paymentsApi';
export { documentsApi } from './documentsApi';
export { reportsApi } from './reportsApi';
export { productsApi } from './productsApi';
export { inventoryApi } from './inventoryApi';
export { salesApi } from './salesApi';
export { purchasesApi } from './purchasesApi';
export { suppliersApi } from './suppliersApi';
export { supplierPaymentsApi } from './supplierPaymentsApi';
export { settingsApi } from './settingsApi';
