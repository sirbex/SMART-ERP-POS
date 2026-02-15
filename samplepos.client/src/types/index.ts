/**
 * Type Exports
 * 
 * Central export point for all TypeScript types
 */

// API Types
export type {
  ApiResponse,
  ApiResponseWithAlerts,
  PaginatedResponse,
  Alert,
  CostPriceChangeAlert,
  ErrorResponse,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  ListQueryParams,
  StockQueryParams,
  ValidationError,
  BatchOperationResponse,
  ExportResponse,
  HealthCheckResponse
} from './api';

export {
  isApiError,
  isApiSuccess,
  hasAlerts,
  extractData,
  extractError
} from './api';

// Business Types
export type {
  User,
  Product,
  ProductWithStock,
  Customer,
  CustomerGroup,
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceipt,
  GoodsReceiptItem,
  InventoryBatch,
  Sale,
  SaleItem,
  StockMovement,
  CostLayer,
  PricingTier,
  CartItem,
  Cart,
  StockLevelSummary,
  DashboardStats,
  ReportFilters,
  AuditLog,
  SystemSettings
} from './business';

// Export UserRole as a type from business
export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';

// Invoice Types
export type { Invoice, InvoicePayment, InvoiceStatus } from './invoice';
