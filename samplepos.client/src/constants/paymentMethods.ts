/**
 * Shared payment method constants for accounting modules
 */

export const CUSTOMER_PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'OTHER', label: 'Other' }
];

export const SUPPLIER_PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHECK', label: 'Check' },
  { value: 'OTHER', label: 'Other' }
];

export const DEPOSIT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' }
];

export const CREDIT_TYPES = [
  { value: 'LOYALTY_POINTS', label: 'Loyalty Points' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'PROMOTIONAL', label: 'Promotional Credit' },
  { value: 'COMPENSATION', label: 'Compensation' }
];