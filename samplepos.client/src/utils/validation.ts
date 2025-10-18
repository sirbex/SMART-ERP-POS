/**
 * Validation utilities for POS calculations and data integrity
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate numerical input for financial calculations
 */
export function validateCurrency(value: any, fieldName: string = 'Amount'): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

  if (value === null || value === undefined) {
    result.isValid = false;
    result.errors.push(`${fieldName} is required`);
    return result;
  }

  const numValue = Number(value);

  if (isNaN(numValue)) {
    result.isValid = false;
    result.errors.push(`${fieldName} must be a valid number`);
    return result;
  }

  if (numValue < 0) {
    result.isValid = false;
    result.errors.push(`${fieldName} cannot be negative`);
    return result;
  }

  // Check for excessive precision (more than 2 decimal places)
  const decimalPlaces = (numValue.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    result.warnings.push(`${fieldName} will be rounded to 2 decimal places`);
  }

  // Check for extremely large values
  if (numValue > 999999999.99) {
    result.isValid = false;
    result.errors.push(`${fieldName} is too large (maximum: 999,999,999.99)`);
  }

  return result;
}

/**
 * Validate quantity input
 */
export function validateQuantity(value: any, fieldName: string = 'Quantity'): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

  if (value === null || value === undefined || value === '') {
    result.isValid = false;
    result.errors.push(`${fieldName} is required`);
    return result;
  }

  const numValue = Number(value);

  if (isNaN(numValue)) {
    result.isValid = false;
    result.errors.push(`${fieldName} must be a valid number`);
    return result;
  }

  if (numValue <= 0) {
    result.isValid = false;
    result.errors.push(`${fieldName} must be greater than zero`);
    return result;
  }

  // Check for excessive precision (more than 3 decimal places for quantities)
  const decimalPlaces = (numValue.toString().split('.')[1] || '').length;
  if (decimalPlaces > 3) {
    result.warnings.push(`${fieldName} will be rounded to 3 decimal places`);
  }

  // Check for extremely large quantities
  if (numValue > 999999) {
    result.isValid = false;
    result.errors.push(`${fieldName} is too large (maximum: 999,999)`);
  }

  return result;
}

/**
 * Validate cart item with ultra-precise batch and expiry validation
 */
export function validateCartItem(item: any): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

  if (!item) {
    result.isValid = false;
    result.errors.push('Cart item is required');
    return result;
  }

  // Validate product name
  if (!item.name || typeof item.name !== 'string' || item.name.trim() === '') {
    result.isValid = false;
    result.errors.push('Product name is required');
  }

  // Validate price
  const priceValidation = validateCurrency(item.price, 'Price');
  result.errors.push(...priceValidation.errors);
  result.warnings.push(...priceValidation.warnings);
  if (!priceValidation.isValid) {
    result.isValid = false;
  }

  // Validate quantity
  const quantityValidation = validateQuantity(item.quantity, 'Quantity');
  result.errors.push(...quantityValidation.errors);
  result.warnings.push(...quantityValidation.warnings);
  if (!quantityValidation.isValid) {
    result.isValid = false;
  }

  // Validate UoM conversion if present
  if (item.conversionFactor !== undefined) {
    if (typeof item.conversionFactor !== 'number' || item.conversionFactor <= 0) {
      result.isValid = false;
      result.errors.push('Conversion factor must be a positive number');
    }
  }

  if (item.unitPrice !== undefined) {
    const unitPriceValidation = validateCurrency(item.unitPrice, 'Unit Price');
    result.errors.push(...unitPriceValidation.errors);
    result.warnings.push(...unitPriceValidation.warnings);
    if (!unitPriceValidation.isValid) {
      result.isValid = false;
    }
  }

  // Ultra-precise batch and inventory validation
  try {
    const batchValidation = validateItemInventoryPrecision(item);
    result.errors.push(...batchValidation.errors);
    result.warnings.push(...batchValidation.warnings);
    if (!batchValidation.isValid) {
      result.isValid = false;
    }
  } catch (error) {
    result.warnings.push('Could not perform advanced inventory validation');
  }

  return result;
}

/**
 * Ultra-precise inventory and batch validation
 */
export function validateItemInventoryPrecision(item: any): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };
  
  // Dynamic import to avoid circular dependencies
  if (typeof window !== 'undefined' && (window as any).getFIFOCostInfo) {
    try {
      const getFIFOCostInfo = (window as any).getFIFOCostInfo;
      const validQuantity = typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity || '0');
      const actualQuantityNeeded = item.conversionFactor && item.conversionFactor > 0 
        ? validQuantity * item.conversionFactor 
        : validQuantity;
      
      const fifoInfo = getFIFOCostInfo(item.name, actualQuantityNeeded);
      
      // Check if item can be fulfilled
      if (!fifoInfo.canFulfill) {
        result.isValid = false;
        result.errors.push(`Insufficient inventory for ${item.name}. Requested: ${actualQuantityNeeded}, Available: ${fifoInfo.batchesUsed.reduce((sum: number, b: any) => sum + b.quantity, 0)}`);
      }
      
      // Check expiry risks
      if (fifoInfo.expiryRiskLevel === 'critical') {
        result.warnings.push(`CRITICAL: ${item.name} contains batches expiring within 24 hours!`);
      } else if (fifoInfo.expiryRiskLevel === 'high') {
        result.warnings.push(`HIGH RISK: ${item.name} contains batches expiring within 3 days`);
      } else if (fifoInfo.expiryRiskLevel === 'medium') {
        result.warnings.push(`Medium risk: ${item.name} contains batches expiring within 7 days`);
      }
      
      // Check stock health
      if (fifoInfo.stockHealth === 'critical') {
        result.warnings.push(`Stock health CRITICAL for ${item.name} - immediate attention required`);
      } else if (fifoInfo.stockHealth === 'warning') {
        result.warnings.push(`Stock health warning for ${item.name} - monitor closely`);
      }
      
      // Check allocation efficiency
      if (fifoInfo.allocationEfficiency < 80 && fifoInfo.batchesUsed.length > 2) {
        result.warnings.push(`Low allocation efficiency (${Math.round(fifoInfo.allocationEfficiency)}%) - requires ${fifoInfo.batchesUsed.length} batches for ${item.name}`);
      }
      
      // Check for expired batches being used (should not happen but extra safety)
      const hasExpiredBatches = fifoInfo.batchesUsed.some((batch: any) => 
        batch.daysToExpiry !== undefined && batch.daysToExpiry < 0
      );
      if (hasExpiredBatches) {
        result.isValid = false;
        result.errors.push(`Cannot sell ${item.name} - contains expired batches`);
      }
      
    } catch (error) {
      // Graceful degradation - don't block the sale for validation errors
      result.warnings.push('Advanced inventory validation temporarily unavailable');
    }
  }
  
  return result;
}

/**
 * Validate complete transaction before processing
 */
export function validateTransaction(cart: any[], subtotal: number, discount: number, tax: number): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

  // Validate cart is not empty
  if (!cart || cart.length === 0) {
    result.isValid = false;
    result.errors.push('Cart cannot be empty');
    return result;
  }

  // Validate each cart item
  for (let i = 0; i < cart.length; i++) {
    const itemValidation = validateCartItem(cart[i]);
    if (!itemValidation.isValid) {
      result.isValid = false;
      result.errors.push(`Item ${i + 1}: ${itemValidation.errors.join(', ')}`);
    }
    result.warnings.push(...itemValidation.warnings.map(w => `Item ${i + 1}: ${w}`));
  }

  // Validate financial totals
  const subtotalValidation = validateCurrency(subtotal, 'Subtotal');
  if (!subtotalValidation.isValid) {
    result.isValid = false;
    result.errors.push(...subtotalValidation.errors);
  }

  const discountValidation = validateCurrency(discount, 'Discount');
  if (!discountValidation.isValid) {
    result.isValid = false;
    result.errors.push(...discountValidation.errors);
  }

  const taxValidation = validateCurrency(tax, 'Tax');
  if (!taxValidation.isValid) {
    result.isValid = false;
    result.errors.push(...taxValidation.errors);
  }

  // Check discount doesn't exceed subtotal
  if (discount > subtotal) {
    result.isValid = false;
    result.errors.push('Discount cannot exceed subtotal');
  }

  // Check total is reasonable
  const total = subtotal - discount + tax;
  if (total < 0) {
    result.isValid = false;
    result.errors.push('Transaction total cannot be negative');
  }

  return result;
}

/**
 * Safe number conversion with validation
 */
export function safeParseNumber(value: any, defaultValue: number = 0): number {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  if (isNaN(parsed)) {
    return defaultValue;
  }

  // Round to prevent floating point precision issues
  return Math.round(parsed * 100) / 100;
}

/**
 * Safe currency formatting that handles edge cases
 */
export function safeCurrencyFormat(value: any, currencyCode: string = 'UGX'): string {
  const safeValue = safeParseNumber(value, 0);
  
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD', // Using USD pattern for formatting structure
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    
    const parts = formatter.formatToParts(safeValue);
    const numberPortion = parts
      .filter(p => p.type !== 'currency' && p.type !== 'literal')
      .map(p => p.value)
      .join('');
    
    return `${currencyCode} ${numberPortion}`;
  } catch (error) {
    // Fallback for any formatting errors
    return `${currencyCode} ${safeValue.toFixed(2)}`;
  }
}