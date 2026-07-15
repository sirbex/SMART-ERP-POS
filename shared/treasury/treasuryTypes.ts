/**
 * Treasury Document domain types (ADR-003 Phase 1A)
 */

export const TREASURY_DOCUMENT_TYPES = [
  'DEPOSIT_WORKSHEET',
  'TREASURY_TRANSFER',
  'PETTY_CASH',
  'CASH_WITHDRAWAL',
  'CASH_DEPOSIT',
  'CARD_SETTLEMENT',
  'MOBILE_MONEY_SETTLEMENT',
  'VAT_REMITTANCE',
  'WHT_REMITTANCE',
  'TREASURY_REVERSAL',
] as const;

export type TreasuryDocumentType = (typeof TREASURY_DOCUMENT_TYPES)[number];

export const TREASURY_DOCUMENT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'POSTED',
  'CANCELLED',
] as const;

export type TreasuryDocumentStatus = (typeof TREASURY_DOCUMENT_STATUSES)[number];

export const TREASURY_LINE_TYPES = [
  'RECEIPT_APPLICATION',
  'ACCOUNT_MOVE',
  'ADJUSTMENT',
  'FEE',
  'SHORTAGE',
  'OVERAGE',
] as const;

export type TreasuryLineType = (typeof TREASURY_LINE_TYPES)[number];

/** PostingSource values introduced for treasury (mirrors postingGovernanceService). */
export const TREASURY_POSTING_SOURCES = [
  'TREASURY_DEPOSIT',
  'TREASURY_TRANSFER',
  'TREASURY_PETTY_CASH',
  'TREASURY_REVERSAL',
  'VAT_REMITTANCE',
  'WHT_REMITTANCE',
] as const;

export type TreasuryPostingSource = (typeof TREASURY_POSTING_SOURCES)[number];

export const LIQUIDITY_ACCOUNT_TAGS = [
  'CASH',
  'PETTY_CASH',
  'UNDEPOSITED_FUNDS',
  'BANK',
  'CARD_CLEARING',
  'MOBILE_MONEY',
] as const;

export type LiquidityAccountTag = (typeof LIQUIDITY_ACCOUNT_TAGS)[number];

/** Well-known liquidity CoA codes (TD-INV-6 fallback when tags lag). */
export const LIQUIDITY_ACCOUNT_CODES = [
  '1010',
  '1012',
  '1015',
  '1020',
  '1030',
  '1040',
] as const;

export type LiquidityAccountCode = (typeof LIQUIDITY_ACCOUNT_CODES)[number];

export function isLiquidityAccountCode(code: string): boolean {
  return (LIQUIDITY_ACCOUNT_CODES as readonly string[]).includes(code);
}

export function isLiquidityAccountTag(tag: string | null | undefined): boolean {
  if (!tag) return false;
  return (LIQUIDITY_ACCOUNT_TAGS as readonly string[]).includes(tag);
}

export interface TreasuryDocumentLineInput {
  lineType?: TreasuryLineType;
  accountCode: string;
  description?: string;
  debitAmount?: number;
  creditAmount?: number;
  amount?: number;
  sourceReceiptId?: string;
  sourcePaymentId?: string;
  sourceSessionMovementId?: string;
  memo?: string;
}

export interface TreasuryDocumentLine extends TreasuryDocumentLineInput {
  id: string;
  treasuryDocumentId: string;
  lineNumber: number;
  lineType: TreasuryLineType;
  debitAmount: number;
  creditAmount: number;
  amount: number;
}

export interface TreasuryDocument {
  id: string;
  documentNumber: string;
  documentType: TreasuryDocumentType;
  status: TreasuryDocumentStatus;
  currencyCode: string;
  transactionDate: string;
  postingDate: string | null;
  memo: string | null;
  totalAmount: number;
  overageAmount: number;
  shortageAmount: number;
  fromAccountCode: string | null;
  toAccountCode: string | null;
  bankAccountId: string | null;
  depositReference: string | null;
  requiresApproval: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  postedAt: string | null;
  journalEntryId: string | null;
  reversesDocumentId: string | null;
  reversedByDocumentId: string | null;
  rowVersion: number;
  lines: TreasuryDocumentLine[];
}

export function postingSourceForDocumentType(
  documentType: TreasuryDocumentType,
): TreasuryPostingSource {
  switch (documentType) {
    case 'DEPOSIT_WORKSHEET':
    case 'CARD_SETTLEMENT':
    case 'MOBILE_MONEY_SETTLEMENT':
      return 'TREASURY_DEPOSIT';
    case 'PETTY_CASH':
      return 'TREASURY_PETTY_CASH';
    case 'TREASURY_REVERSAL':
      return 'TREASURY_REVERSAL';
    case 'WHT_REMITTANCE':
      return 'WHT_REMITTANCE';
    case 'VAT_REMITTANCE':
      return 'VAT_REMITTANCE';
    case 'TREASURY_TRANSFER':
    case 'CASH_WITHDRAWAL':
    case 'CASH_DEPOSIT':
    default:
      return 'TREASURY_TRANSFER';
  }
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineDebitCredit(line: {
  debitAmount?: number;
  creditAmount?: number;
  amount?: number;
}): { debit: number; credit: number } {
  const debit = roundMoney(Number(line.debitAmount ?? 0));
  const credit = roundMoney(Number(line.creditAmount ?? 0));
  if (debit > 0 || credit > 0) {
    return { debit, credit };
  }
  const amount = roundMoney(Number(line.amount ?? 0));
  if (amount > 0) {
    // amount alone is ambiguous — callers should set debit/credit; treat as debit for residual
    return { debit: amount, credit: 0 };
  }
  return { debit: 0, credit: 0 };
}
