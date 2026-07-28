import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveDialogPresentation,
  resolveFormColumns,
} from '../lib/adaptiveForms';
import { resolveGridPresentation } from '../lib/adaptiveDataGrid';

const here = dirname(fileURLToPath(import.meta.url));

describe('adaptive pilots (Phase 3)', () => {
  it('keeps form / dialog / grid policies coherent for pilot modules', () => {
    expect(resolveFormColumns('mobile')).toBe(1);
    expect(resolveDialogPresentation('mobile')).toBe('full');
    expect(resolveGridPresentation('mobile')).toBe('cards');

    expect(resolveFormColumns('compact')).toBe(2);
    expect(resolveDialogPresentation('compact')).toBe('near-full');
    expect(resolveGridPresentation('compact')).toBe('reduced');

    expect(resolveDialogPresentation('desktop')).toBe('modal');
    expect(resolveGridPresentation('desktop')).toBe('full');
  });

  it('Credit/Debit Notes consume AdaptiveDataGrid + AdaptiveDialog', () => {
    const src = readFileSync(
      resolve(here, '../pages/accounting/CreditDebitNotesPage.tsx'),
      'utf8',
    );
    expect(src).toContain('CustomerNotesAdaptiveGrid');
    expect(src).toContain('SupplierNotesAdaptiveGrid');
    expect(src).toContain('AdaptiveDialog');
    expect(src).toContain('AdaptiveFormLayout');
    expect(src).toContain('Create & Post to GL');
    expect(src).toContain('Apply to Open Bills');
  });

  it('POS DiscountDialog uses AdaptiveDialog; POSModal keeps DialogPortal', () => {
    const discount = readFileSync(
      resolve(here, '../components/pos/DiscountDialog.tsx'),
      'utf8',
    );
    const posModal = readFileSync(
      resolve(here, '../components/pos/POSModal.tsx'),
      'utf8',
    );
    expect(discount).toContain('AdaptiveDialog');
    expect(discount).toContain('AdaptiveFormLayout');
    expect(posModal).toContain('DialogPortal');
    expect(posModal).toContain('resolveDialogPresentation');
    expect(posModal).toContain('data-dialog-presentation');
  });

  it('Accounting + POS shells provide AdaptiveAppShell for tier tokens', () => {
    const accounting = readFileSync(
      resolve(here, '../components/AccountingLayout.tsx'),
      'utf8',
    );
    const pos = readFileSync(resolve(here, '../pages/pos/POSPage.tsx'), 'utf8');
    expect(accounting).toContain('AdaptiveAppShell');
    expect(pos).toContain('AdaptiveAppShell');
  });
});
