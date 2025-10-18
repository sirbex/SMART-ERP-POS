import { formatCurrency as formatCurrencyWithSettings, DEFAULT_CURRENCY } from './currencyFormatter';

/**
 * Central currency formatting function
 * All currency formatting should use this function to ensure consistency
 * across the entire application.
 * 
 * Uses DEFAULT_CURRENCY (UGX) for now. Components that need custom currency
 * should use formatCurrencyWithSettings() from currencyFormatter.ts directly.
 */
export function formatCurrency(value: number | null | undefined): string {
  return formatCurrencyWithSettings(value, DEFAULT_CURRENCY);
}
