import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('restaurant customer search (FOH primary)', () => {
  it('shows CustomerSelector on every open ticket (including dine-in)', () => {
    const page = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    expect(page).toContain("import CustomerSelector from '../../components/pos/CustomerSelector'");
    expect(page).toContain('data-restaurant-customer="primary"');
    expect(page).not.toMatch(
      /serviceChannel\s*&&\s*chrome\.secondaryActions\s*===\s*'inline'\s*\?\s*\([\s\S]*CustomerSelector/,
    );
    expect(page).not.toMatch(
      /\{serviceChannel \? \(\s*<div[\s\S]*data-restaurant-customer="primary"/,
    );
    expect(page).toContain("'Customer (optional)'");
  });

  it('renders compact customer results in-flow so overflow parents cannot clip them', () => {
    const selector = readFileSync(
      resolve(here, '../components/pos/CustomerSelector.tsx'),
      'utf8',
    );
    expect(selector).toContain('data-customer-results="inline"');
    expect(selector).toContain('showDropdown && compact');
    expect(selector).toContain('showDropdown && !compact');
  });
});

describe('order/restaurant complete sale receipt print', () => {
  it('OrderPaymentPage prints a receipt after complete sale (POS parity)', () => {
    const page = readFileSync(
      resolve(here, '../pages/orders/OrderPaymentPage.tsx'),
      'utf8',
    );
    expect(page).toContain("import { printReceipt } from '../../lib/print'");
    expect(page).toContain('buildReceiptDataFromCheckout');
    expect(page).toContain('fetchInvoiceSettingsForReceipt');
    expect(page).toContain('printReceipt(');
    expect(page).toContain('Sale completed — receipt print failed');
  });
});
