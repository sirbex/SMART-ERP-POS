/**
 * EVIDENCE: Invoice PDF and receipt payment accounts share visibility SSOT.
 * BANK and MOBILE_MONEY (Airtel) must never diverge on filter semantics.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  accountsForInvoice,
  accountsForReceipt,
  normalizePaymentAccounts,
} from '@shared/utils/paymentAccountsVisibility.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readRel(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

const bankAndAirtel = [
  {
    id: '1',
    type: 'BANK',
    provider: 'Stanbic Bank',
    accountName: 'Alliad Uganda',
    accountNumber: '90300…',
    isActive: true,
    showOnInvoice: true,
    showOnReceipt: true,
    sortOrder: 0,
  },
  {
    id: '2',
    type: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    accountName: 'Airtel Money',
    accountNumber: '4403581',
    isActive: true,
    showOnInvoice: true,
    showOnReceipt: true,
    sortOrder: 1,
  },
];

describe('payment accounts invoice PDF parity', () => {
  it('includes BANK and MOBILE_MONEY when both ticked for invoice', () => {
    const inv = accountsForInvoice(bankAndAirtel);
    expect(inv.map((a) => a.type).sort()).toEqual(['BANK', 'MOBILE_MONEY']);
    expect(inv.map((a) => a.provider)).toEqual(['Stanbic Bank', 'AIRTEL']);
  });

  it('treats missing showOnInvoice as ON (legacy rows without flags)', () => {
    const legacy = [
      {
        type: 'BANK',
        provider: 'Centenary',
        accountName: 'Biz Co',
        accountNumber: '123456',
        // isActive / showOn* intentionally omitted
      },
      {
        type: 'MOBILE_MONEY',
        provider: 'AIRTEL',
        accountName: 'Airtel Money',
        accountNumber: '4403581',
        showOnInvoice: true,
      },
    ];
    const inv = accountsForInvoice(legacy as never);
    expect(inv).toHaveLength(2);
    expect(inv.some((a) => a.type === 'BANK')).toBe(true);
  });

  it('excludes only explicit false flags (not by type)', () => {
    const mixed = [
      { ...bankAndAirtel[0], showOnInvoice: false },
      bankAndAirtel[1],
    ];
    expect(accountsForInvoice(mixed).map((a) => a.type)).toEqual(['MOBILE_MONEY']);

    const bankOffActive = [
      { ...bankAndAirtel[0], isActive: false },
      bankAndAirtel[1],
    ];
    expect(accountsForInvoice(bankOffActive).map((a) => a.provider)).toEqual(['AIRTEL']);
  });

  it('normalizes snake_case legacy keys so bank is not dropped', () => {
    const snake = [
      {
        type: 'BANK',
        provider: 'Equity',
        account_name: 'Biz',
        account_number: '999',
        is_active: true,
        show_on_invoice: true,
        show_on_receipt: true,
      },
    ];
    const n = normalizePaymentAccounts(snake as never);
    expect(n).toHaveLength(1);
    expect(accountsForInvoice(snake as never)[0]?.accountNumber).toBe('999');
  });

  it('receipt filter uses same default-ON semantics', () => {
    const rec = accountsForReceipt(bankAndAirtel);
    expect(rec).toHaveLength(2);
  });
});

describe('EVIDENCE — wiring does not reintroduce strict filters', () => {
  it('invoiceBody uses !== false for showOnInvoice', () => {
    const body = readRel('src/modules/documents/bodies/invoiceBody.ts');
    expect(body).toMatch(/showOnInvoice\s*!==\s*false/);
    expect(body).not.toMatch(/\.filter\(\s*a\s*=>\s*a\.showOnInvoice\s*\)/);
  });

  it('documentTheme normalizes payment accounts', () => {
    const theme = readRel('src/modules/documents/documentTheme.ts');
    expect(theme).toMatch(/normalizePaymentAccounts/);
  });

  it('invoice settings GET/PUT normalize accounts', () => {
    const svc = readRel('src/modules/settings/invoiceSettingsService.ts');
    expect(svc).toMatch(/withNormalizedPaymentAccounts/);
    expect(svc).toMatch(/normalizePaymentAccounts/);
  });
});
