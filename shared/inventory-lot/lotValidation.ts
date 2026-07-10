import type { LotAttributes, ProductLotPolicy } from './lotTypes.js';
import {
  LOT_RULE_CODES,
  receiptExpirySatisfied,
  validateAttributeCorrectionInput,
  validateLotDateAttributes,
} from './lotRules.js';

export interface LotValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
  rule?: string;
}

export function lotValidationFailure(
  error: string,
  code: string,
  rule: string,
): LotValidationResult {
  return { valid: false, error, code, rule };
}

export function lotValidationOk(): LotValidationResult {
  return { valid: true };
}

/** Validate lot attributes on goods receipt / opening balance */
export function validateReceiptLot(
  policy: ProductLotPolicy,
  receivedQuantity: number,
  attributes: LotAttributes,
  businessDate: string,
): LotValidationResult {
  if (!receiptExpirySatisfied(policy, receivedQuantity, attributes.expiryDate)) {
    return lotValidationFailure(
      'Expiry date is required for products with expiry tracking enabled',
      'MISSING_EXPIRY_DATE',
      LOT_RULE_CODES.INV_011,
    );
  }

  if (receivedQuantity > 0 && policy.trackExpiry && attributes.expiryDate) {
    const dateError = validateLotDateAttributes(attributes, businessDate);
    if (dateError) {
      return lotValidationFailure(dateError, 'INVALID_EXPIRY_DATE', LOT_RULE_CODES.INV_003);
    }
  }

  return lotValidationOk();
}

export function validateLotAttributeCorrection(
  input: Parameters<typeof validateAttributeCorrectionInput>[0],
): LotValidationResult {
  const error = validateAttributeCorrectionInput(input);
  if (error) {
    return lotValidationFailure(error, 'INVALID_LOT_ATTRIBUTE_CORRECTION', LOT_RULE_CODES.LOT_CORRECT);
  }
  return lotValidationOk();
}
