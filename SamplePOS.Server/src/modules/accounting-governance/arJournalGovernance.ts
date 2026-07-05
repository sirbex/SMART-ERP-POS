/**
 * AR (1200) journal rules — AR-INV-1 and heal-key blocks.
 */
import logger from '../../utils/logger.js';
import { PostingGovernanceError } from '../../services/postingGovernanceService.js';
import type { PostingSource } from '../../services/postingGovernanceService.js';
import type { GovernanceJournalContext, GovernanceJournalLine } from './types.js';

export const AR_ACCOUNT_CODE = '1200';

export type ArGovernanceMode = 'off' | 'warn' | 'enforce';

const AR_DRIFT_HEAL_KEY = /^AR-DRIFT-HEAL-/;

/** Map journal context to a workflow label for warn-mode evidence reports. */
export function inferArWorkflow(ctx: GovernanceJournalContext): string {
  const key = ctx.idempotencyKey ?? '';
  if (key.startsWith('SALE_REFUND-')) return 'refund';
  if (key.startsWith('INVOICE_PAYMENT-')) return 'invoice_payment';
  if (key.startsWith('CUSTOMER_PAYMENT-')) return 'customer_payment';
  if (key.startsWith('CUSTOMER_OB-')) return 'opening_balance';
  if (key.startsWith('CREDIT_NOTE-')) return 'credit_note';
  if (key.startsWith('DEBIT_NOTE-')) return 'debit_note';
  if (key.startsWith('DEPOSIT_APPLICATION-')) return 'deposit_application';
  if (key.startsWith('DOWN_PAYMENT_CLEARING-')) return 'down_payment_clearing';

  switch (ctx.referenceType) {
    case 'SALE':
      return 'credit_sale';
    case 'SALE_REFUND':
      return 'refund';
    case 'INVOICE_PAYMENT':
      return 'invoice_payment';
    case 'CUSTOMER_PAYMENT':
      return 'customer_payment';
    case 'INVOICE':
      return 'customer_invoice';
    case 'CREDIT_NOTE':
      return 'credit_note';
    case 'DEBIT_NOTE':
      return 'debit_note';
    case 'CUSTOMER_OPENING_BALANCE':
      return 'opening_balance';
    case 'DEPOSIT_APPLICATION':
      return 'deposit_application';
    case 'DOWN_PAYMENT_CLEARING':
      return 'down_payment_clearing';
    case 'DELIVERY_CHARGE':
      return 'delivery_charge';
    case 'DELIVERY_NOTE_INVOICE':
      return 'delivery_note_invoice';
    default:
      return ctx.referenceType ?? ctx.source ?? 'unknown';
  }
}

const AR_ENTITY_EXCEPTION_SOURCES = new Set<PostingSource>([
  'CUTOVER_OB',
  'OPENING_BALANCE_WIZARD',
]);

const touchesAr = (line: GovernanceJournalLine) =>
  line.accountCode === AR_ACCOUNT_CODE && (line.debitAmount > 0.009 || line.creditAmount > 0.009);

function hasCustomerEntity(line: GovernanceJournalLine): boolean {
  return line.entityType?.toLowerCase() === 'customer' && Boolean(line.entityId?.trim());
}

export function getArGovernanceMode(): ArGovernanceMode {
  const explicit = process.env.AR_GOVERNANCE_MODE?.trim().toLowerCase();
  if (explicit === 'warn' || explicit === 'enforce' || explicit === 'off') {
    return explicit;
  }
  if (
    process.env.AR_GOVERNANCE_ENFORCE === 'true' ||
    process.env.ACCOUNTING_JOURNAL_GOVERNANCE_ENFORCE === 'true'
  ) {
    return 'enforce';
  }
  return 'off';
}

export function isArEntityAttributionEnforced(): boolean {
  return getArGovernanceMode() === 'enforce';
}

export function validateArJournalPostingAlways(ctx: GovernanceJournalContext): void {
  const { idempotencyKey } = ctx;

  if (idempotencyKey && AR_DRIFT_HEAL_KEY.test(idempotencyKey)) {
    throw new PostingGovernanceError(
      'Global AR drift heal journals are disabled. Fix posting paths at source; use Migration 534 for one-time metadata backfill.',
      'GOV_RULE_I_AR_DRIFT_HEAL_DISABLED',
      { idempotencyKey },
    );
  }
}

export function validateArJournalPostingEntity(ctx: GovernanceJournalContext): void {
  const { referenceType, source, idempotencyKey, lines } = ctx;

  if (source && AR_ENTITY_EXCEPTION_SOURCES.has(source)) {
    return;
  }

  if (referenceType === 'CUSTOMER_OPENING_BALANCE' && source === 'CUTOVER_OB') {
    return;
  }

  for (const line of lines) {
    if (!touchesAr(line)) continue;

    if (hasCustomerEntity(line)) continue;

    if (
      (referenceType === 'CORRECTION' || referenceType === 'SYSTEM_CORRECTION') &&
      idempotencyKey &&
      !AR_DRIFT_HEAL_KEY.test(idempotencyKey)
    ) {
      throw new PostingGovernanceError(
        'CORRECTION on Accounts Receivable (1200) requires entityType=customer and entityId.',
        'GOV_RULE_I_AR_CORRECTION_ENTITY',
        { referenceType, accountCode: line.accountCode, idempotencyKey },
      );
    }

    throw new PostingGovernanceError(
      'AR journal missing customer attribution. Every line on account 1200 requires entityType=customer and entityId.',
      'GOV_RULE_I_AR_ENTITY_REQUIRED',
      { referenceType, source, accountCode: line.accountCode },
    );
  }
}

export function validateArJournalPosting(ctx: GovernanceJournalContext): void {
  validateArJournalPostingAlways(ctx);

  const mode = getArGovernanceMode();
  if (mode === 'off') return;

  try {
    validateArJournalPostingEntity(ctx);
  } catch (err) {
    if (mode === 'warn' && err instanceof PostingGovernanceError) {
      logger.warn('[AR-GOV] Entity attribution violation (warn mode — posting allowed)', {
        event: 'AR_GOVERNANCE_WARN',
        code: err.code,
        message: err.message,
        workflow: inferArWorkflow(ctx),
        referenceType: ctx.referenceType,
        referenceId: ctx.referenceId,
        referenceNumber: ctx.referenceNumber,
        source: ctx.source,
        idempotencyKey: ctx.idempotencyKey,
      });
      return;
    }
    throw err;
  }
}
