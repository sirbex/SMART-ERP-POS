/**
 * Validation Utilities
 * 
 * Business rule validation functions matching backend business logic.
 * All validations use Decimal.js for bank-grade precision.
 */

import Decimal from 'decimal.js';
import { BUSINESS_RULES, VALIDATION } from './constants';

/**
 * Validation Result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  errors?: string[];
  code?: string;
  rule?: string;
}

/**
 * BR-INV-001: Validate sufficient stock before sale
 */
export function validateSufficientStock(
  availableQuantity: number | Decimal | string,
  requestedQuantity: number | Decimal | string
): ValidationResult {
  const available = new Decimal(availableQuantity || 0);
  const requested = new Decimal(requestedQuantity || 0);
  
  if (requested.greaterThan(available)) {
    return {
      valid: false,
      error: `Insufficient stock. Available: ${available.toString()}, Requested: ${requested.toString()}`,
      code: 'INSUFFICIENT_STOCK',
      rule: BUSINESS_RULES.INV_001
    };
  }
  
  return { valid: true };
}

/**
 * BR-INV-002: Validate positive quantity for adjustments
 */
export function validatePositiveQuantity(quantity: number | Decimal | string): ValidationResult {
  const qty = new Decimal(quantity || 0);
  
  if (qty.lessThanOrEqualTo(0)) {
    return {
      valid: false,
      error: 'Quantity must be positive',
      code: 'INVALID_QUANTITY',
      rule: BUSINESS_RULES.INV_002
    };
  }
  
  return { valid: true };
}

/**
 * BR-SAL-003: Validate credit limit not exceeded
 */
export function validateCreditLimit(
  currentBalance: number | Decimal | string,
  creditLimit: number | Decimal | string,
  newAmount: number | Decimal | string
): ValidationResult {
  const balance = new Decimal(currentBalance || 0);
  const limit = new Decimal(creditLimit || 0);
  const amount = new Decimal(newAmount || 0);
  
  const newBalance = balance.plus(amount);
  
  if (newBalance.greaterThan(limit)) {
    return {
      valid: false,
      error: `Credit limit exceeded. Current: ${balance.toString()}, Limit: ${limit.toString()}, New Amount: ${amount.toString()}`,
      code: 'CREDIT_LIMIT_EXCEEDED',
      rule: BUSINESS_RULES.SAL_003
    };
  }
  
  return { valid: true };
}

/**
 * BR-PO-001: Validate supplier name
 */
export function validateSupplierName(name: string): ValidationResult {
  if (!name || name.trim().length < VALIDATION.MIN_SUPPLIER_NAME) {
    return {
      valid: false,
      error: `Supplier name must be at least ${VALIDATION.MIN_SUPPLIER_NAME} characters`,
      code: 'INVALID_SUPPLIER_NAME',
      rule: BUSINESS_RULES.PO_001
    };
  }
  
  if (name.length > VALIDATION.MAX_SUPPLIER_NAME) {
    return {
      valid: false,
      error: `Supplier name must not exceed ${VALIDATION.MAX_SUPPLIER_NAME} characters`,
      code: 'INVALID_SUPPLIER_NAME',
      rule: BUSINESS_RULES.PO_001
    };
  }
  
  return { valid: true };
}

/**
 * BR-PO-003: Validate positive unit cost
 */
export function validateUnitCost(cost: number | Decimal | string): ValidationResult {
  const costDecimal = new Decimal(cost || 0);
  
  if (costDecimal.lessThanOrEqualTo(0)) {
    return {
      valid: false,
      error: 'Unit cost must be positive',
      code: 'INVALID_UNIT_COST',
      rule: BUSINESS_RULES.PO_003
    };
  }
  
  return { valid: true };
}

/**
 * BR-PRC-001: Validate cost price < selling price
 */
export function validateProductPricing(
  costPrice: number | Decimal | string,
  sellingPrice: number | Decimal | string
): ValidationResult {
  const cost = new Decimal(costPrice || 0);
  const selling = new Decimal(sellingPrice || 0);
  
  if (cost.lessThanOrEqualTo(0)) {
    return {
      valid: false,
      error: 'Cost price must be positive',
      code: 'INVALID_COST_PRICE',
      rule: BUSINESS_RULES.PRC_001
    };
  }
  
  if (selling.lessThanOrEqualTo(0)) {
    return {
      valid: false,
      error: 'Selling price must be positive',
      code: 'INVALID_SELLING_PRICE',
      rule: BUSINESS_RULES.PRC_001
    };
  }
  
  if (cost.greaterThanOrEqualTo(selling)) {
    return {
      valid: false,
      error: `Selling price (${selling.toString()}) must be greater than cost price (${cost.toString()})`,
      code: 'INVALID_PRICING',
      rule: BUSINESS_RULES.PRC_001
    };
  }
  
  return { valid: true };
}

/**
 * BR-PRC-002: Validate min stock ≤ reorder level ≤ max stock
 */
export function validateStockLevels(
  minStock: number | Decimal | string,
  reorderLevel: number | Decimal | string,
  maxStock: number | Decimal | string
): ValidationResult {
  const min = new Decimal(minStock || 0);
  const reorder = new Decimal(reorderLevel || 0);
  const max = new Decimal(maxStock || 0);
  
  if (min.lessThan(0) || reorder.lessThan(0) || max.lessThan(0)) {
    return {
      valid: false,
      error: 'Stock levels must be non-negative',
      code: 'INVALID_STOCK_LEVELS',
      rule: BUSINESS_RULES.PRC_002
    };
  }
  
  if (reorder.lessThan(min)) {
    return {
      valid: false,
      error: `Reorder level (${reorder.toString()}) must be >= minimum stock (${min.toString()})`,
      code: 'INVALID_STOCK_LEVELS',
      rule: BUSINESS_RULES.PRC_002
    };
  }
  
  if (reorder.greaterThan(max)) {
    return {
      valid: false,
      error: `Reorder level (${reorder.toString()}) must be <= maximum stock (${max.toString()})`,
      code: 'INVALID_STOCK_LEVELS',
      rule: BUSINESS_RULES.PRC_002
    };
  }
  
  return { valid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): ValidationResult {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!email || !emailRegex.test(email)) {
    return {
      valid: false,
      error: 'Invalid email format',
      code: 'INVALID_EMAIL'
    };
  }
  
  return { valid: true };
}

/**
 * Validate phone number (Uganda format)
 */
export function validatePhone(phone: string): ValidationResult {
  // Uganda phone: +256 XXX XXX XXX or 0XXX XXX XXX
  const phoneRegex = /^(\+256|0)[0-9]{9}$/;
  const cleaned = phone.replace(/\s/g, '');
  
  if (!cleaned || !phoneRegex.test(cleaned)) {
    return {
      valid: false,
      error: 'Invalid phone number format. Use +256XXXXXXXXX or 0XXXXXXXXX',
      code: 'INVALID_PHONE'
    };
  }
  
  return { valid: true };
}

/**
 * Validate SKU format
 */
export function validateSKU(sku: string): ValidationResult {
  if (!sku || sku.trim().length < VALIDATION.MIN_SKU) {
    return {
      valid: false,
      error: `SKU must be at least ${VALIDATION.MIN_SKU} characters`,
      code: 'INVALID_SKU'
    };
  }
  
  if (sku.length > VALIDATION.MAX_SKU) {
    return {
      valid: false,
      error: `SKU must not exceed ${VALIDATION.MAX_SKU} characters`,
      code: 'INVALID_SKU'
    };
  }
  
  // Only alphanumeric and hyphens
  if (!/^[A-Z0-9-]+$/i.test(sku)) {
    return {
      valid: false,
      error: 'SKU can only contain letters, numbers, and hyphens',
      code: 'INVALID_SKU'
    };
  }
  
  return { valid: true };
}

/**
 * Validate product name
 */
export function validateProductName(name: string): ValidationResult {
  if (!name || name.trim().length < VALIDATION.MIN_PRODUCT_NAME) {
    return {
      valid: false,
      error: `Product name must be at least ${VALIDATION.MIN_PRODUCT_NAME} characters`,
      code: 'INVALID_PRODUCT_NAME'
    };
  }
  
  if (name.length > VALIDATION.MAX_PRODUCT_NAME) {
    return {
      valid: false,
      error: `Product name must not exceed ${VALIDATION.MAX_PRODUCT_NAME} characters`,
      code: 'INVALID_PRODUCT_NAME'
    };
  }
  
  return { valid: true };
}

/**
 * Validate customer name
 */
export function validateCustomerName(name: string): ValidationResult {
  if (!name || name.trim().length < VALIDATION.MIN_CUSTOMER_NAME) {
    return {
      valid: false,
      error: `Customer name must be at least ${VALIDATION.MIN_CUSTOMER_NAME} characters`,
      code: 'INVALID_CUSTOMER_NAME'
    };
  }
  
  if (name.length > VALIDATION.MAX_CUSTOMER_NAME) {
    return {
      valid: false,
      error: `Customer name must not exceed ${VALIDATION.MAX_CUSTOMER_NAME} characters`,
      code: 'INVALID_CUSTOMER_NAME'
    };
  }
  
  return { valid: true };
}

/**
 * Validate expiry date (must be future date)
 */
export function validateExpiryDate(expiryDate: Date | string): ValidationResult {
  const expiry = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (expiry < today) {
    return {
      valid: false,
      error: 'Expiry date must be in the future',
      code: 'INVALID_EXPIRY_DATE'
    };
  }
  
  return { valid: true };
}

/**
 * Check if product is expiring soon
 */
export function isExpiringSoon(expiryDate: Date | string, warningDays: number = VALIDATION.EXPIRY_WARNING_DAYS): boolean {
  const expiry = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate;
  const today = new Date();
  const warningDate = new Date();
  warningDate.setDate(today.getDate() + warningDays);
  
  return expiry <= warningDate;
}

/**
 * Check if product is expired
 */
export function isExpired(expiryDate: Date | string): boolean {
  const expiry = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return expiry < today;
}

/**
 * Calculate days until expiry
 */
export function daysUntilExpiry(expiryDate: Date | string): number {
  const expiry = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Determine cost change severity
 */
export function getCostChangeSeverity(
  oldCost: number | Decimal | string,
  newCost: number | Decimal | string
): 'HIGH' | 'MEDIUM' | 'LOW' {
  const oldDecimal = new Decimal(oldCost || 0);
  const newDecimal = new Decimal(newCost || 0);
  
  if (oldDecimal.isZero()) {
    return 'LOW';
  }
  
  const changePercent = newDecimal.minus(oldDecimal).dividedBy(oldDecimal).times(100).abs();
  
  if (changePercent.greaterThan(VALIDATION.COST_CHANGE_HIGH_PERCENT)) {
    return 'HIGH';
  } else if (changePercent.greaterThan(VALIDATION.COST_CHANGE_MEDIUM_PERCENT)) {
    return 'MEDIUM';
  } else {
    return 'LOW';
  }
}

/**
 * Validate batch number format
 */
export function validateBatchNumber(batchNumber: string): ValidationResult {
  if (!batchNumber || batchNumber.trim().length < 3) {
    return {
      valid: false,
      error: 'Batch number must be at least 3 characters',
      code: 'INVALID_BATCH_NUMBER'
    };
  }
  
  if (batchNumber.length > 50) {
    return {
      valid: false,
      error: 'Batch number must not exceed 50 characters',
      code: 'INVALID_BATCH_NUMBER'
    };
  }
  
  return { valid: true };
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): ValidationResult {
  if (!password || password.length < 8) {
    return {
      valid: false,
      error: 'Password must be at least 8 characters',
      code: 'WEAK_PASSWORD'
    };
  }
  
  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one uppercase letter',
      code: 'WEAK_PASSWORD'
    };
  }
  
  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one lowercase letter',
      code: 'WEAK_PASSWORD'
    };
  }
  
  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one number',
      code: 'WEAK_PASSWORD'
    };
  }
  
  return { valid: true };
}

/**
 * Validate quantity range
 */
export function validateQuantityRange(
  quantity: number | Decimal | string,
  min = VALIDATION.MIN_QUANTITY,
  max = VALIDATION.MAX_QUANTITY
): ValidationResult {
  const qty = new Decimal(quantity || 0);
  
  if (qty.lessThan(min)) {
    return {
      valid: false,
      error: `Quantity must be at least ${min.toString()}`,
      code: 'INVALID_QUANTITY'
    };
  }
  
  if (qty.greaterThan(max)) {
    return {
      valid: false,
      error: `Quantity must not exceed ${max.toString()}`,
      code: 'INVALID_QUANTITY'
    };
  }
  
  return { valid: true };
}

/**
 * Validate non-negative amount
 */
export function validateNonNegativeAmount(amount: number | Decimal | string): ValidationResult {
  const amountDecimal = new Decimal(amount || 0);
  
  if (amountDecimal.lessThan(0)) {
    return {
      valid: false,
      error: 'Amount must be non-negative',
      code: 'INVALID_AMOUNT'
    };
  }
  
  return { valid: true };
}

/**
 * Validate stock adjustment
 * Combines BR-INV-001 and BR-INV-002
 */
export function validateStockAdjustment(params: {
  currentQuantity: number | Decimal | string;
  adjustmentQuantity: number | Decimal | string;
}): ValidationResult {
  const current = new Decimal(params.currentQuantity || 0);
  const adjustment = new Decimal(params.adjustmentQuantity || 0);
  
  // Must have an adjustment value
  if (adjustment.equals(0)) {
    return {
      valid: false,
      error: 'Adjustment quantity cannot be zero',
      code: 'ZERO_ADJUSTMENT',
    };
  }
  
  // Result must be non-negative (BR-INV-002)
  const newQuantity = current.plus(adjustment);
  if (newQuantity.lessThan(0)) {
    return {
      valid: false,
      error: 'Adjustment would result in negative stock',
      code: 'NEGATIVE_RESULT',
      rule: BUSINESS_RULES.INV_002
    };
  }
  
  return { valid: true };
}
