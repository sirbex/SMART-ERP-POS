/**
 * Currency Formatting Utilities
 * 
 * Standalone currency formatting functions extracted from SettingsService.
 * Can be used with settings from backend API or default values.
 * 
 * @module utils/currencyFormatter
 */

export interface CurrencySettings {
  code: string;
  symbol: string;
  name: string;
  decimalPlaces: number;
  symbolPosition: 'before' | 'after';
  thousandsSeparator: string;
  decimalSeparator: string;
}

/**
 * Default currency settings (UGX - Ugandan Shilling)
 * Used as fallback when settings are not available
 */
export const DEFAULT_CURRENCY: CurrencySettings = {
  code: 'UGX',
  symbol: 'UGX',
  name: 'Ugandan Shilling',
  decimalPlaces: 0,
  symbolPosition: 'before',
  thousandsSeparator: ',',
  decimalSeparator: '.'
};

/**
 * Common currencies for quick selection
 */
export const COMMON_CURRENCIES: CurrencySettings[] = [
  {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    decimalPlaces: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.'
  },
  {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    decimalPlaces: 2,
    symbolPosition: 'after',
    thousandsSeparator: ' ',
    decimalSeparator: ','
  },
  {
    code: 'GBP',
    symbol: '£',
    name: 'British Pound',
    decimalPlaces: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.'
  },
  {
    code: 'UGX',
    symbol: 'UGX',
    name: 'Ugandan Shilling',
    decimalPlaces: 0,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.'
  },
  {
    code: 'KES',
    symbol: 'KSh',
    name: 'Kenyan Shilling',
    decimalPlaces: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.'
  },
  {
    code: 'NGN',
    symbol: '₦',
    name: 'Nigerian Naira',
    decimalPlaces: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.'
  },
  {
    code: 'ZAR',
    symbol: 'R',
    name: 'South African Rand',
    decimalPlaces: 2,
    symbolPosition: 'before',
    thousandsSeparator: ' ',
    decimalSeparator: '.'
  }
];

/**
 * Format amount according to currency settings
 * 
 * @param amount - The numeric amount to format
 * @param currencySettings - Currency configuration (uses DEFAULT_CURRENCY if not provided)
 * @returns Formatted currency string (e.g., "UGX 1,234" or "$ 1,234.56")
 * 
 * @example
 * formatCurrencyAmount(1234.56, { symbol: '$', decimalPlaces: 2, symbolPosition: 'before' })
 * // Returns: "$ 1,234.56"
 * 
 * @example
 * formatCurrencyAmount(1234, DEFAULT_CURRENCY)
 * // Returns: "UGX 1,234"
 */
export function formatCurrencyAmount(
  amount: number,
  currencySettings: CurrencySettings = DEFAULT_CURRENCY
): string {
  // Format the number with proper decimal places
  const formattedNumber = amount.toLocaleString(undefined, {
    minimumFractionDigits: currencySettings.decimalPlaces,
    maximumFractionDigits: currencySettings.decimalPlaces,
    useGrouping: true
  });

  // Position symbol before or after based on settings
  if (currencySettings.symbolPosition === 'before') {
    return `${currencySettings.symbol} ${formattedNumber}`;
  } else {
    return `${formattedNumber} ${currencySettings.symbol}`;
  }
}

/**
 * Format currency with null/undefined safety
 * 
 * Handles edge cases for invalid or missing values by defaulting to 0.
 * 
 * @param value - The value to format (can be null or undefined)
 * @param currencySettings - Currency configuration (optional)
 * @returns Formatted currency string, or "0" formatted if value is invalid
 * 
 * @example
 * formatCurrency(null) // Returns: "UGX 0"
 * formatCurrency(undefined) // Returns: "UGX 0"
 * formatCurrency(1234.56) // Returns: "UGX 1,235" (rounded, no decimals for UGX)
 */
export function formatCurrency(
  value: number | null | undefined,
  currencySettings: CurrencySettings = DEFAULT_CURRENCY
): string {
  // Handle edge cases for invalid or null values
  if (value === null || value === undefined || !Number.isFinite(value) || isNaN(value)) {
    return formatCurrencyAmount(0, currencySettings);
  }
  
  return formatCurrencyAmount(value, currencySettings);
}

/**
 * Parse currency settings from backend Setting value
 * 
 * Backend stores settings as JSON strings in the `value` field.
 * This helper safely parses and validates the currency settings.
 * 
 * @param settingValue - The JSON string from backend Setting.value
 * @returns Parsed CurrencySettings or DEFAULT_CURRENCY if invalid
 * 
 * @example
 * const setting = { key: 'currency', value: '{"code":"USD",...}' };
 * const currency = parseCurrencySettings(setting.value);
 */
export function parseCurrencySettings(settingValue: string | null | undefined): CurrencySettings {
  if (!settingValue) {
    return DEFAULT_CURRENCY;
  }

  try {
    const parsed = JSON.parse(settingValue);
    
    // Validate required fields
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.code &&
      parsed.symbol &&
      typeof parsed.decimalPlaces === 'number' &&
      (parsed.symbolPosition === 'before' || parsed.symbolPosition === 'after')
    ) {
      return parsed as CurrencySettings;
    }
  } catch (error) {
    console.error('Error parsing currency settings:', error);
  }

  return DEFAULT_CURRENCY;
}

/**
 * Find currency by code from common currencies list
 * 
 * @param code - Currency code (e.g., 'USD', 'EUR', 'UGX')
 * @returns CurrencySettings if found, DEFAULT_CURRENCY otherwise
 * 
 * @example
 * const usd = getCurrencyByCode('USD');
 * // Returns: { code: 'USD', symbol: '$', ... }
 */
export function getCurrencyByCode(code: string): CurrencySettings {
  const currency = COMMON_CURRENCIES.find(c => c.code === code);
  return currency || DEFAULT_CURRENCY;
}

/**
 * Validate currency settings object
 * 
 * @param settings - Object to validate
 * @returns true if valid CurrencySettings, false otherwise
 */
export function isValidCurrencySettings(settings: any): settings is CurrencySettings {
  return (
    settings &&
    typeof settings === 'object' &&
    typeof settings.code === 'string' &&
    typeof settings.symbol === 'string' &&
    typeof settings.name === 'string' &&
    typeof settings.decimalPlaces === 'number' &&
    (settings.symbolPosition === 'before' || settings.symbolPosition === 'after') &&
    typeof settings.thousandsSeparator === 'string' &&
    typeof settings.decimalSeparator === 'string'
  );
}
