/**
 * VAT Remittance invariants (ADR-005) — contractual domain rules.
 */

import {
  roundMoney,
  VAT_CONTROL_ACCOUNT,
  isWhtOffLimitsAccount,
} from './vatRemittanceTypes.js';

export class VatRemittanceInvariantError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'VatRemittanceInvariantError';
  }
}

/** VR-INV-2: remittance cannot exceed available payable. */
export function assertRemittanceCeiling(input: {
  remittanceAmount: number;
  availableVatPayable: number;
  epsilon?: number;
}): void {
  const eps = input.epsilon ?? 0.01;
  const amount = roundMoney(input.remittanceAmount);
  const available = roundMoney(input.availableVatPayable);
  if (amount <= 0) {
    throw new VatRemittanceInvariantError(
      'VAT remittance amount must be positive (VR-INV-2)',
      'VR_INV_2_CEILING',
    );
  }
  if (amount - available > eps) {
    throw new VatRemittanceInvariantError(
      `VAT remittance ${amount} exceeds available payable ${available} (VR-INV-2)`,
      'VR_INV_2_CEILING',
    );
  }
}

/** VR-INV-5: remittance journal lines must not touch WHT accounts. */
export function assertVatRemittanceAccounts(input: {
  lines: Array<{ accountCode: string }>;
}): void {
  for (const line of input.lines) {
    if (isWhtOffLimitsAccount(line.accountCode)) {
      throw new VatRemittanceInvariantError(
        `VAT remittance must not post to WHT account ${line.accountCode} (VR-INV-5)`,
        'VR_INV_5_WHT_ACCOUNT',
      );
    }
  }
}

/** VR-INV-1 shape helper: remittance must debit VAT control 2300. */
export function assertRemittanceDebitsVatControl(input: {
  lines: Array<{ accountCode: string; debitAmount: number; creditAmount: number }>;
}): void {
  const debit2300 = input.lines
    .filter((l) => l.accountCode === VAT_CONTROL_ACCOUNT)
    .reduce((s, l) => s + Number(l.debitAmount || 0), 0);
  if (roundMoney(debit2300) <= 0) {
    throw new VatRemittanceInvariantError(
      `VAT remittance must debit Tax Payable ${VAT_CONTROL_ACCOUNT} (VR-INV-1)`,
      'VR_INV_1_NO_2300_DEBIT',
    );
  }
}

/** VR-INV-6: product VAT config must not use WHT receivable 1250. */
export function assertProductVatAccountNotWht(input: {
  taxPayableAccount?: string | null;
  taxReceivableAccount?: string | null;
}): void {
  if (isWhtOffLimitsAccount(input.taxReceivableAccount ?? undefined)) {
    throw new VatRemittanceInvariantError(
      `Product VAT tax_receivable_account must not be WHT account ${input.taxReceivableAccount} (VR-INV-6)`,
      'VR_INV_6_WHT_COLLISION',
    );
  }
  if (input.taxPayableAccount && input.taxPayableAccount !== VAT_CONTROL_ACCOUNT) {
    // Soft: payable should be 2300 for net VAT control — warn via dedicated code
    if (isWhtOffLimitsAccount(input.taxPayableAccount)) {
      throw new VatRemittanceInvariantError(
        `Product VAT tax_payable_account must not be WHT account ${input.taxPayableAccount} (VR-INV-6)`,
        'VR_INV_6_WHT_COLLISION',
      );
    }
  }
}

/** VR-INV-9: posting source must be VAT remittance, not WHT. */
export function assertVatPostingSourceNotWht(source: string): void {
  if (source === 'WHT_REMITTANCE' || source === 'WHT_RECEIVABLE_RECOVERY') {
    throw new VatRemittanceInvariantError(
      `VAT settlement must not use WHT posting source ${source} (VR-INV-9)`,
      'VR_INV_9_WHT_SOURCE',
    );
  }
}
