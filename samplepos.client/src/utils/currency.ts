import SettingsService from '../services/SettingsService';

/**
 * Central currency formatting function that uses the SettingsService
 * All currency formatting should use this function to ensure consistency
 * across the entire application based on admin settings
 */
export function formatCurrency(value: number | null | undefined) {
  // Handle edge cases for invalid or null values
  if (value === null || value === undefined || !Number.isFinite(value) || isNaN(value)) {
    return SettingsService.getInstance().formatCurrency(0);
  }
  
  return SettingsService.getInstance().formatCurrency(value);
}
