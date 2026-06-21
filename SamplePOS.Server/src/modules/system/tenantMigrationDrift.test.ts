import { findDriftedMigrationFiles } from './migrationAnchors.js';

describe('tenantMigrationDrift', () => {
  it('flags 418 when ar_customer_payments is missing (Bliss drift case)', () => {
    const tables = new Set(['customers', 'invoices', 'users']);
    const anchors = {
      '418_ar_customer_payment_allocations.sql': ['ar_customer_payments', 'ar_payment_allocations'],
    };
    const drifted = findDriftedMigrationFiles(tables, anchors);
    expect(drifted).toContain('418_ar_customer_payment_allocations.sql');
  });

  it('passes when AR payment tables exist', () => {
    const anchors = {
      '418_ar_customer_payment_allocations.sql': ['ar_customer_payments', 'ar_payment_allocations'],
    };
    const tables = new Set(['ar_customer_payments', 'ar_payment_allocations']);
    expect(findDriftedMigrationFiles(tables, anchors)).toHaveLength(0);
  });

  it('flags when only one of two anchor tables exists', () => {
    const anchors = {
      '418_ar_customer_payment_allocations.sql': ['ar_customer_payments', 'ar_payment_allocations'],
    };
    const tables = new Set(['ar_customer_payments']);
    expect(findDriftedMigrationFiles(tables, anchors)).toContain(
      '418_ar_customer_payment_allocations.sql',
    );
  });
});
