import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('restaurant customer / waiter selector (single entry)', () => {
  it('uses one header button — CustomerSelector only in the details dialog', () => {
    const page = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    expect(page).toContain("import CustomerSelector from '../../components/pos/CustomerSelector'");
    expect(page).toContain('data-restaurant-party="open"');
    expect(page).toContain('data-ticket-header-actions="true"');
    expect(page).toContain('data-ticket-dialog="details"');
    expect(page).toContain('data-restaurant-customer="dialog"');
    expect(page).toContain("'Customer (optional)'");
    // No duplicated on-ticket CustomerSelector strip
    expect(page).not.toContain('data-restaurant-customer="primary"');
    expect(page).not.toMatch(
      /data-restaurant-customer="primary"[\s\S]*CustomerSelector/,
    );
    // Exactly one CustomerSelector JSX usage (dialog)
    expect(page.match(/<CustomerSelector/g)?.length).toBe(1);
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
