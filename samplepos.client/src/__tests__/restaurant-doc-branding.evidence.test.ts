import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  brandingFromTenant,
  documentCompanyHeaderHtml,
  mergeDocumentCompanyBranding,
} from '../lib/documentCompanyBranding';

const here = dirname(fileURLToPath(import.meta.url));
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

describe('Restaurant docs use company branding SSOT', () => {
  it('brandingFromTenant trims tenant fields', () => {
    expect(
      brandingFromTenant({
        companyName: '  Acme Cafe  ',
        companyAddress: '  1 Main St  ',
        companyPhone: '  +256  ',
      }),
    ).toEqual({
      companyName: 'Acme Cafe',
      companyAddress: '1 Main St',
      companyPhone: '+256',
    });
  });

  it('guest header includes name/address/phone; kitchen is name-only', () => {
    const branding = brandingFromTenant({
      companyName: 'Acme Cafe',
      companyAddress: '1 Main St',
      companyPhone: '+256',
    });
    const guest = documentCompanyHeaderHtml(branding, { mode: 'guest', escapeHtml: esc });
    expect(guest).toContain('Acme Cafe');
    expect(guest).toContain('1 Main St');
    expect(guest).toContain('+256');

    const kitchen = documentCompanyHeaderHtml(branding, { mode: 'kitchen', escapeHtml: esc });
    expect(kitchen).toContain('Acme Cafe');
    expect(kitchen).not.toContain('1 Main St');
    expect(kitchen).not.toContain('+256');
  });

  it('printRestaurant + POS + thermalGuestDocument wire branding SSOT', () => {
    const print = readFileSync(resolve(here, '../lib/printRestaurant.ts'), 'utf8');
    const guest = readFileSync(resolve(here, '../lib/thermalGuestDocument.ts'), 'utf8');
    const pos = readFileSync(resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'), 'utf8');
    expect(print).toContain('documentCompanyHeaderHtml');
    expect(print).toContain("mode: 'kitchen'");
    expect(guest).toContain('documentCompanyHeaderHtml');
    expect(guest).toContain("mode: 'guest'");
    expect(print).toContain('NO PRICES');
    expect(pos).toContain('fetchInvoiceSettingsForReceipt');
    expect(pos).toContain('mergeDocumentCompanyBranding');
    expect(pos).toContain('companyBranding.companyName');
    expect(pos).toContain('companyBranding.companyAddress');
    expect(pos).toContain('companyBranding.companyPhone');
  });

  it('mergeDocumentCompanyBranding prefers Invoice Settings over tenant fallback', () => {
    expect(
      mergeDocumentCompanyBranding(
        {
          companyName: 'Invoice Co',
          companyAddress: 'Invoice Addr',
          companyPhone: null,
        },
        {
          companyName: 'Tenant Co',
          companyAddress: 'Tenant Addr',
          companyPhone: '+256700',
        },
      ),
    ).toEqual({
      companyName: 'Invoice Co',
      companyAddress: 'Invoice Addr',
      companyPhone: '+256700',
    });
  });
});
