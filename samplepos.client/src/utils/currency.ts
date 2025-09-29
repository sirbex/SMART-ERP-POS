export const CURRENCY = 'UGX';

const formatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD', // Using USD pattern as fallback formatting; we will prepend custom code
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Formats numeric value using Intl for grouping and decimals, then swaps symbol with provided code.
export function formatCurrency(value: number, code: string = CURRENCY) {
  if (!Number.isFinite(value)) return `${code} 0.00`;
  // Use parts to build a consistent numeric layout
  const parts = formatter.formatToParts(value);
  const numberPortion = parts
    .filter(p => p.type !== 'currency' && p.type !== 'literal')
    .map(p => p.value)
    .join('');
  return `${code} ${numberPortion}`;
}
