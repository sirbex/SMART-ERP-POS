/**
 * Data Transformation Utilities
 * 
 * Standardized transformations between backend and frontend data models
 */

/**
 * Backend Product → Frontend Product
 */
export function transformProduct(backendProduct: any): any {
  return {
    id: backendProduct.id?.toString() || '',
    name: backendProduct.name || '',
    sku: backendProduct.barcode || backendProduct.id || '',
    barcode: backendProduct.barcode || '',
    category: backendProduct.category || 'Uncategorized',
    unit: backendProduct.baseUnit || 'pcs',
    price: Number(backendProduct.sellingPrice) || 0,
    sellingPrice: Number(backendProduct.sellingPrice) || 0,
    costPrice: Number(backendProduct.costPrice) || 0,
    basePrice: Number(backendProduct.costPrice) || 0,
    currentStock: Number(backendProduct.currentStock) || 0,
    quantity: Number(backendProduct.currentStock) || 0,
    reorderLevel: Number(backendProduct.reorderLevel) || 10,
    isActive: backendProduct.isActive !== false,
    hasExpiry: false,
    createdAt: backendProduct.createdAt,
    updatedAt: backendProduct.updatedAt
  };
}

/**
 * Backend Customer → Frontend Customer
 */
export function transformCustomer(backendCustomer: any): any {
  return {
    id: backendCustomer.id,
    name: backendCustomer.name,
    contact: backendCustomer.phone || '',
    phone: backendCustomer.phone || '',
    email: backendCustomer.email || '',
    address: backendCustomer.address || '',
    balance: Number(backendCustomer.accountBalance) || 0,
    accountBalance: Number(backendCustomer.accountBalance) || 0,
    creditLimit: Number(backendCustomer.creditLimit) || 0,
    notes: backendCustomer.notes || '',
    joinDate: backendCustomer.createdAt,
    createdAt: backendCustomer.createdAt,
    type: backendCustomer.type || 'individual',
    isActive: backendCustomer.isActive !== false
  };
}

/**
 * Backend Sale → Frontend Transaction
 */
export function transformSale(backendSale: any): any {
  return {
    id: backendSale.id,
    invoiceNumber: backendSale.invoiceNumber,
    date: backendSale.saleDate,
    saleDate: backendSale.saleDate,
    customer: backendSale.customer?.name || 'Walk-in Customer',
    customerId: backendSale.customerId,
    customerName: backendSale.customer?.name || 'Walk-in Customer',
    subtotal: Number(backendSale.subtotal) || 0,
    discount: Number(backendSale.discount) || 0,
    tax: Number(backendSale.tax) || 0,
    total: Number(backendSale.totalAmount) || 0,
    totalAmount: Number(backendSale.totalAmount) || 0,
    status: backendSale.status || 'COMPLETED',
    items: backendSale.items?.map((item: any) => ({
      productId: item.productId,
      productName: item.product?.name || '',
      quantity: Number(item.quantity) || 0,
      unit: item.unit || 'pcs',
      unitPrice: Number(item.unitPrice) || 0,
      discount: Number(item.discount) || 0,
      lineTotal: Number(item.lineTotal) || 0
    })) || [],
    payments: backendSale.payments?.map((payment: any) => ({
      method: payment.method,
      amount: Number(payment.amount) || 0,
      reference: payment.reference
    })) || [],
    createdBy: backendSale.createdBy?.username || backendSale.cashier?.username || '',
    createdAt: backendSale.createdAt
  };
}

/**
 * Backend Supplier → Frontend Supplier
 */
export function transformSupplier(backendSupplier: any): any {
  return {
    id: backendSupplier.id,
    name: backendSupplier.name,
    contact: backendSupplier.contactPerson || '',
    contactPerson: backendSupplier.contactPerson || '',
    phone: backendSupplier.phone || '',
    email: backendSupplier.email || '',
    address: backendSupplier.address || '',
    notes: backendSupplier.notes || '',
    paymentTerms: backendSupplier.paymentTerms || '',
    isActive: backendSupplier.isActive !== false,
    createdAt: backendSupplier.createdAt
  };
}

/**
 * Transform paginated response
 */
export function transformPaginatedResponse<T>(
  response: any,
  transformer: (item: any) => T
): {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
} {
  const data = response.data?.data || response.data || [];
  const pagination = response.data?.pagination || {};
  
  return {
    data: data.map(transformer),
    pagination: {
      total: pagination.total || 0,
      page: pagination.page || 1,
      limit: pagination.limit || data.length,
      totalPages: pagination.totalPages || 1,
      hasNext: pagination.hasNext || false,
      hasPrev: pagination.hasPrev || false
    }
  };
}

/**
 * Frontend Product → Backend Product (for create/update)
 */
export function toBackendProduct(frontendProduct: any): any {
  return {
    name: frontendProduct.name,
    barcode: frontendProduct.barcode || frontendProduct.sku,
    sku: frontendProduct.sku,
    category: frontendProduct.category,
    baseUnit: frontendProduct.unit || frontendProduct.baseUnit,
    sellingPrice: Number(frontendProduct.price || frontendProduct.sellingPrice),
    costPrice: Number(frontendProduct.costPrice || frontendProduct.basePrice),
    reorderLevel: Number(frontendProduct.reorderLevel),
    isActive: frontendProduct.isActive !== false
  };
}

/**
 * Frontend Customer → Backend Customer (for create/update)
 */
export function toBackendCustomer(frontendCustomer: any): any {
  return {
    name: frontendCustomer.name,
    phone: frontendCustomer.phone || frontendCustomer.contact,
    email: frontendCustomer.email,
    address: frontendCustomer.address,
    type: (frontendCustomer.type || 'INDIVIDUAL').toUpperCase(),
    creditLimit: Number(frontendCustomer.creditLimit) || 0,
    notes: frontendCustomer.notes
  };
}

/**
 * Convert date string to display format
 */
export function formatDateForDisplay(dateString: string): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Convert date string to ISO format for backend
 */
export function formatDateForBackend(dateString: string): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  return date.toISOString();
}

/**
 * Normalize phone number
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  
  // Remove all non-numeric characters
  return phone.replace(/\D/g, '');
}

/**
 * Parse backend enum to frontend enum
 */
export function parseEnum<T extends string>(
  value: string | undefined,
  allowedValues: readonly T[],
  defaultValue: T
): T {
  if (!value) return defaultValue;
  
  const upperValue = value.toUpperCase() as T;
  return allowedValues.includes(upperValue) ? upperValue : defaultValue;
}

/**
 * Safe number conversion
 */
export function toNumber(value: any, defaultValue: number = 0): number {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Safe boolean conversion
 */
export function toBoolean(value: any, defaultValue: boolean = false): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return Boolean(value);
}

export default {
  transformProduct,
  transformCustomer,
  transformSale,
  transformSupplier,
  transformPaginatedResponse,
  toBackendProduct,
  toBackendCustomer,
  formatDateForDisplay,
  formatDateForBackend,
  normalizePhone,
  parseEnum,
  toNumber,
  toBoolean
};
