/**
 * Utility helpers for Radix UI Select components
 * Handles conversion between number IDs and string values
 */

/**
 * Convert a number or string ID to string for Select value prop
 */
export function toSelectValue(id: string | number | undefined): string {
  if (id === undefined || id === null) return '';
  return String(id);
}

/**
 * Convert a Select string value back to original ID type
 */
export function fromSelectValue(value: string, originalType: 'string' | 'number' = 'string'): string | number {
  if (originalType === 'number') {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }
  return value;
}

/**
 * Check if two IDs match regardless of type (string vs number)
 */
export function idsMatch(id1: string | number | undefined, id2: string | number | undefined): boolean {
  if (id1 === undefined || id2 === undefined) return false;
  return String(id1) === String(id2);
}
