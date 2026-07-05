/**
 * Shared helpers for customer-scoped AR (1200) journal lines.
 */
import { BusinessRuleException } from '../../errors/BusinessRuleException.js';

export const CUSTOMER_ENTITY_TYPE = 'customer' as const;

export function requireCustomerIdForAr(customerId: string | undefined | null, context: string): string {
  if (!customerId?.trim()) {
    throw new BusinessRuleException(
      `Accounts Receivable posting requires a customer: ${context}`,
      'AR_CUSTOMER_REQUIRED',
      { context },
    );
  }
  return customerId;
}

export function customerArLine(params: {
  customerId: string;
  debitAmount?: number;
  creditAmount?: number;
  description: string;
}): {
  accountCode: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  entityType: typeof CUSTOMER_ENTITY_TYPE;
  entityId: string;
} {
  return {
    accountCode: '1200',
    description: params.description,
    debitAmount: params.debitAmount ?? 0,
    creditAmount: params.creditAmount ?? 0,
    entityType: CUSTOMER_ENTITY_TYPE,
    entityId: params.customerId,
  };
}
