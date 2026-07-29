/**
 * Shared payment method constants for accounting modules
 */

export const CUSTOMER_PAYMENT_METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'MOBILE_MONEY', label: 'MTN Mobile Money' },
  { value: 'AIRTEL_MONEY', label: 'Airtel Money' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' }
];

export const SUPPLIER_PAYMENT_METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'MOBILE_MONEY', label: 'MTN Mobile Money' },
  { value: 'AIRTEL_MONEY', label: 'Airtel Money' },
  { value: 'CARD', label: 'Card' },
  { value: 'CHECK', label: 'Check' },
];

export const DEPOSIT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'MOBILE_MONEY', label: 'MTN Mobile Money' },
  { value: 'AIRTEL_MONEY', label: 'Airtel Money' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' }
];

export const CREDIT_TYPES = [
  { value: 'LOYALTY_POINTS', label: 'Loyalty Points' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'PROMOTIONAL', label: 'Promotional Credit' },
  { value: 'COMPENSATION', label: 'Compensation' }
];