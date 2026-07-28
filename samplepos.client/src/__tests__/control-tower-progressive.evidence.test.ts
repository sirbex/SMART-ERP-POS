import { describe, expect, it } from 'vitest';
import { buildTowerWorkspaceLaunchers } from '../lib/financialControlTower';

/**
 * Evidence: Control Tower workspace launchers must render without health data
 * so operators are never blocked waiting on financial-health.
 */
describe('Control Tower progressive launchers', () => {
  it('builds operational launchers with empty health summaries', () => {
    const launchers = buildTowerWorkspaceLaunchers([], [], '2026-07-28');
    expect(launchers.length).toBeGreaterThanOrEqual(4);
    for (const launcher of launchers) {
      expect(launcher.operational).toBe(true);
      expect(launcher.path.length).toBeGreaterThan(1);
      expect(launcher.title.length).toBeGreaterThan(0);
    }
    const titles = launchers.map((l) => l.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        'Supplier Reconciliation',
        'Customer Reconciliation',
        'Inventory Reconciliation',
        'Bank Reconciliation',
      ]),
    );
  });
});
