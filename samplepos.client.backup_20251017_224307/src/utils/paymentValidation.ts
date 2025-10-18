/**
 * Utility functions for validating different payment methods
 */

// Common Mobile Money providers and their reference number formats
export type MobileMoneyProvider = 
  | 'M-Pesa'
  | 'Airtel Money'
  | 'MTN Mobile Money'
  | 'Orange Money'
  | 'Vodacom M-Pesa'
  | 'Other';

// Provider constants for easier reference
export const PROVIDERS = {
  MPESA: 'M-Pesa' as MobileMoneyProvider,
  AIRTEL: 'Airtel Money' as MobileMoneyProvider,
  MTN: 'MTN Mobile Money' as MobileMoneyProvider,
  ORANGE: 'Orange Money' as MobileMoneyProvider,
  VODACOM: 'Vodacom M-Pesa' as MobileMoneyProvider,
  GENERIC: 'Other' as MobileMoneyProvider
};

/**
 * Interface for Mobile Money validation results
 */
export interface MobileMoneyValidationResult {
  isValid: boolean;
  provider?: MobileMoneyProvider;
  errorMessage?: string;
}

/**
 * Validates an M-Pesa transaction reference number
 * M-Pesa format is typically 10 digits starting with a letter (e.g., LGR12345678)
 */
export function validateMPesaReference(reference: string): boolean {
  // M-Pesa reference is typically a letter followed by numbers (e.g., LGR12345678)
  const mpesaRegex = /^[A-Z]{1,3}\d{8,10}$/;
  return mpesaRegex.test(reference);
}

/**
 * Validates an Airtel Money transaction reference number
 * Airtel Money typically uses 10-12 alphanumeric characters
 */
export function validateAirtelMoneyReference(reference: string): boolean {
  // Airtel Money typically has a format like TRX12345678 or ABCD1234567
  const airtelRegex = /^[A-Z]{2,4}\d{8,10}$/;
  return airtelRegex.test(reference);
}

/**
 * Validates an MTN Mobile Money transaction reference number
 * MTN typically uses numeric-only IDs
 */
export function validateMTNMoneyReference(reference: string): boolean {
  // MTN Mobile Money usually has a numeric format
  const mtnRegex = /^\d{10,12}$/;
  return mtnRegex.test(reference);
}

/**
 * Validates an Orange Money transaction reference number
 */
export function validateOrangeMoneyReference(reference: string): boolean {
  // Orange Money typically starts with OM followed by numbers
  const orangeRegex = /^OM\d{8,10}$/;
  return orangeRegex.test(reference);
}

/**
 * Validates a generic Mobile Money transaction reference
 * Allows for any standard format with sufficient length
 */
export function validateGenericMobileMoneyReference(reference: string): boolean {
  // Generic check for any mobile money reference
  // Must be at least 8 characters and only contain alphanumeric chars
  const genericRegex = /^[A-Z0-9]{8,}$/i;
  return genericRegex.test(reference);
}

/**
 * Attempts to validate a mobile money reference and detect the provider
 * @param reference The mobile money reference number to validate
 * @returns Validation result with provider if detected
 */
export function validateMobileMoneyReference(reference: string): MobileMoneyValidationResult {
  if (!reference || reference.trim() === '') {
    return {
      isValid: false,
      errorMessage: 'Reference number cannot be empty'
    };
  }

  // Try to determine the provider by format
  if (validateMPesaReference(reference)) {
    return {
      isValid: true,
      provider: PROVIDERS.MPESA
    };
  }

  if (validateAirtelMoneyReference(reference)) {
    return {
      isValid: true,
      provider: PROVIDERS.AIRTEL
    };
  }

  if (validateMTNMoneyReference(reference)) {
    return {
      isValid: true,
      provider: PROVIDERS.MTN
    };
  }

  if (validateOrangeMoneyReference(reference)) {
    return {
      isValid: true,
      provider: PROVIDERS.ORANGE
    };
  }

  // Check if it's a valid generic format
  if (validateGenericMobileMoneyReference(reference)) {
    return {
      isValid: true,
      provider: PROVIDERS.GENERIC
    };
  }

  // If we got here, the reference isn't valid for any recognized format
  return {
    isValid: false,
    errorMessage: 'Invalid Mobile Money reference format'
  };
}

/**
 * Validates a credit/debit card reference number (usually last 4 digits)
 */
export function validateCardReference(reference: string): boolean {
  // Card reference is typically the last 4 digits of a card
  const cardRegex = /^\d{4}$/;
  return cardRegex.test(reference);
}

/**
 * Validates a bank transfer reference number
 */
export function validateBankTransferReference(reference: string): boolean {
  // Bank transfers typically have alphanumeric references
  // Minimum 6 characters for security
  const bankRegex = /^[A-Za-z0-9]{6,}$/;
  return bankRegex.test(reference);
}

/**
 * Validates a UPI reference ID
 */
export function validateUPIReference(reference: string): boolean {
  // UPI references typically follow a pattern with @ symbol
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/;
  return upiRegex.test(reference);
}

/**
 * Generic payment reference validation based on payment method
 * @param method The payment method
 * @param reference The reference to validate
 * @returns Whether the reference is valid for the given payment method
 */
export function validatePaymentReference(method: string, reference: string): { 
  isValid: boolean; 
  errorMessage?: string;
  provider?: string;
} {
  switch (method) {
    case 'mobile_money': {
      const result = validateMobileMoneyReference(reference);
      return result;
    }
    case 'card':
      return {
        isValid: validateCardReference(reference),
        errorMessage: validateCardReference(reference) ? undefined : 'Card reference should be the last 4 digits of the card'
      };
    case 'bank_transfer':
      return {
        isValid: validateBankTransferReference(reference),
        errorMessage: validateBankTransferReference(reference) ? undefined : 'Bank reference should be at least 6 alphanumeric characters'
      };
    case 'upi':
      return {
        isValid: validateUPIReference(reference),
        errorMessage: validateUPIReference(reference) ? undefined : 'UPI ID should be in format username@provider'
      };
    default:
      // For other payment methods, just check if reference is not empty
      return {
        isValid: !!reference && reference.trim().length > 0,
        errorMessage: reference && reference.trim().length > 0 ? undefined : 'Reference cannot be empty'
      };
  }
}