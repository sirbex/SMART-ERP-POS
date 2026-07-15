import type { FinancialLaneProvider, FinancialDomain } from './types.js';
import { apReconciliationProvider } from './providers/apReconciliationProvider.js';
import { arReconciliationProvider } from './providers/arReconciliationProvider.js';
import { inventoryReconciliationProvider } from './providers/inventoryReconciliationProvider.js';
import { whtReconciliationProvider } from './providers/whtReconciliationProvider.js';
import { vatReconciliationProvider } from './providers/vatReconciliationProvider.js';

const PROVIDERS: Partial<Record<FinancialDomain, FinancialLaneProvider>> = {
  ap: apReconciliationProvider,
  ar: arReconciliationProvider,
  inventory: inventoryReconciliationProvider,
  wht: whtReconciliationProvider,
  vat: vatReconciliationProvider,
};

export function getFinancialLaneProvider(domain: FinancialDomain): FinancialLaneProvider {
  const provider = PROVIDERS[domain];
  if (!provider) {
    throw new Error(`No financial lane provider registered for domain: ${domain}`);
  }
  return provider;
}

export function listRegisteredDomains(): FinancialDomain[] {
  return Object.keys(PROVIDERS) as FinancialDomain[];
}

export function registerFinancialLaneProvider(
  domain: FinancialDomain,
  provider: FinancialLaneProvider,
): void {
  PROVIDERS[domain] = provider;
}
