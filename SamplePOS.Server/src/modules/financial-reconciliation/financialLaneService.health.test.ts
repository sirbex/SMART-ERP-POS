import { describe, expect, it } from '@jest/globals';
import { FINANCIAL_HEALTH_LANES } from './financialLaneService.js';
import { apReconciliationProvider } from './providers/apReconciliationProvider.js';
import { arReconciliationProvider } from './providers/arReconciliationProvider.js';
import { inventoryReconciliationProvider } from './providers/inventoryReconciliationProvider.js';
import { whtReconciliationProvider } from './providers/whtReconciliationProvider.js';

/**
 * Evidence: Control Tower financial-health must not load history journal dumps.
 * History lanes are the main timeout/failure driver on large tenants.
 */
describe('financial-health light payload', () => {
  it('excludes history from Control Tower lanes', () => {
    expect(FINANCIAL_HEALTH_LANES).not.toContain('history');
    expect(FINANCIAL_HEALTH_LANES).toEqual(
      expect.arrayContaining(['integrity', 'cache', 'quarantine', 'writeoff']),
    );
  });

  it('skips history that AP/AR/inventory/WHT would otherwise load', () => {
    const heavy = [
      apReconciliationProvider,
      arReconciliationProvider,
      inventoryReconciliationProvider,
      whtReconciliationProvider,
    ];
    for (const provider of heavy) {
      expect(provider.supportedLanes).toContain('history');
      const healthLanes = provider.supportedLanes.filter((lane) =>
        FINANCIAL_HEALTH_LANES.includes(lane),
      );
      expect(healthLanes).not.toContain('history');
      expect(healthLanes.length).toBeGreaterThan(0);
      expect(healthLanes.length).toBeLessThan(provider.supportedLanes.length);
    }
  });
});
