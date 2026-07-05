import { describe, expect, it, afterEach } from '@jest/globals';
import { PostingGovernanceError } from '../../services/postingGovernanceService.js';
import {
  validateArJournalPosting,
  validateArJournalPostingEntity,
  validateArJournalPostingAlways,
  isArEntityAttributionEnforced,
  getArGovernanceMode,
} from './arJournalGovernance.js';

describe('arJournalGovernance', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('blocks AR-DRIFT-HEAL idempotency keys even when entity enforcement is off', () => {
    delete process.env.AR_GOVERNANCE_ENFORCE;
    expect(() =>
      validateArJournalPostingAlways({
        idempotencyKey: 'AR-DRIFT-HEAL-2026-07-05',
        lines: [{ accountCode: '1200', debitAmount: 100, creditAmount: 0 }],
      }),
    ).toThrow(PostingGovernanceError);
  });

  it('does not require entity when AR_GOVERNANCE_ENFORCE is unset', () => {
    delete process.env.AR_GOVERNANCE_ENFORCE;
    delete process.env.ACCOUNTING_JOURNAL_GOVERNANCE_ENFORCE;
    expect(isArEntityAttributionEnforced()).toBe(false);
    expect(() =>
      validateArJournalPosting({
        referenceType: 'SALE',
        source: 'SALES_INVOICE',
        lines: [{ accountCode: '1200', debitAmount: 1000, creditAmount: 0 }],
      }),
    ).not.toThrow();
  });

  it('requires customer entity on 1200 when AR_GOVERNANCE_ENFORCE=true', () => {
    process.env.AR_GOVERNANCE_ENFORCE = 'true';
    expect(() =>
      validateArJournalPostingEntity({
        referenceType: 'SALE',
        source: 'SALES_INVOICE',
        lines: [{ accountCode: '1200', debitAmount: 1000, creditAmount: 0 }],
      }),
    ).toThrow(/GOV_RULE_I_AR_ENTITY_REQUIRED|customer attribution/);
  });

  it('allows tagged customer on 1200 when enforcement is on', () => {
    process.env.AR_GOVERNANCE_ENFORCE = 'true';
    expect(() =>
      validateArJournalPostingEntity({
        referenceType: 'SALE',
        source: 'SALES_INVOICE',
        lines: [
          {
            accountCode: '1200',
            debitAmount: 1000,
            creditAmount: 0,
            entityType: 'customer',
            entityId: '43eecb7b-e537-45b9-9119-641c4d1bb525',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('allows CUTOVER_OB without entity check on exception path', () => {
    process.env.AR_GOVERNANCE_ENFORCE = 'true';
    expect(() =>
      validateArJournalPostingEntity({
        referenceType: 'CUSTOMER_OPENING_BALANCE',
        source: 'CUTOVER_OB',
        lines: [{ accountCode: '1200', debitAmount: 500, creditAmount: 0 }],
      }),
    ).not.toThrow();
  });

  it('blocks untagged SYSTEM_CORRECTION on 1200 when enforcement is on', () => {
    process.env.AR_GOVERNANCE_ENFORCE = 'true';
    expect(() =>
      validateArJournalPostingEntity({
        referenceType: 'SYSTEM_CORRECTION',
        source: 'SYSTEM_CORRECTION',
        idempotencyKey: 'AR-METADATA-BACKFILL-534',
        lines: [
          { accountCode: '1200', debitAmount: 100, creditAmount: 0 },
          { accountCode: '4000', debitAmount: 0, creditAmount: 100 },
        ],
      }),
    ).toThrow(/GOV_RULE_I_AR_CORRECTION_ENTITY|customer attribution/);
  });

  it('warn mode logs but does not throw on untagged 1200', () => {
    process.env.AR_GOVERNANCE_MODE = 'warn';
    delete process.env.AR_GOVERNANCE_ENFORCE;
    expect(getArGovernanceMode()).toBe('warn');
    expect(isArEntityAttributionEnforced()).toBe(false);
    expect(() =>
      validateArJournalPosting({
        referenceType: 'SALE',
        source: 'SALES_INVOICE',
        lines: [{ accountCode: '1200', debitAmount: 1000, creditAmount: 0 }],
      }),
    ).not.toThrow();
  });

  it('enforce mode rejects untagged 1200 via AR_GOVERNANCE_MODE', () => {
    process.env.AR_GOVERNANCE_MODE = 'enforce';
    delete process.env.AR_GOVERNANCE_ENFORCE;
    expect(getArGovernanceMode()).toBe('enforce');
    expect(() =>
      validateArJournalPosting({
        referenceType: 'SALE',
        source: 'SALES_INVOICE',
        lines: [{ accountCode: '1200', debitAmount: 1000, creditAmount: 0 }],
      }),
    ).toThrow(PostingGovernanceError);
  });
});

describe('inferArWorkflow', () => {
  it('maps reference types and idempotency keys to workflow labels', async () => {
    const { inferArWorkflow } = await import('./arJournalGovernance.js');
    expect(
      inferArWorkflow({
        referenceType: 'SALE_REFUND',
        idempotencyKey: 'SALE_REFUND-abc',
        lines: [],
      }),
    ).toBe('refund');
    expect(
      inferArWorkflow({
        referenceType: 'INVOICE_PAYMENT',
        idempotencyKey: 'INVOICE_PAYMENT-pay-1',
        lines: [],
      }),
    ).toBe('invoice_payment');
    expect(
      inferArWorkflow({
        referenceType: 'SALE',
        lines: [],
      }),
    ).toBe('credit_sale');
  });
});
