/**
 * Type Helper Utilities
 * 
 * Common utilities for handling type conversions between frontend and backend.
 * Use these to avoid repetitive code and ensure consistency.
 */

/**
 * Safely convert ID to string for components that expect string IDs
 */
export function idToString(id: number | string | undefined): string {
  if (id === undefined) return '';
  return String(id);
}

/**
 * Safely convert ID to number for API calls
 */
export function idToNumber(id: number | string | undefined): number | undefined {
  if (id === undefined) return undefined;
  if (typeof id === 'number') return id;
  const parsed = parseInt(id, 10);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Get short ID for display (first 8 characters)
 */
export function getShortId(id: number | string | undefined): string {
  if (id === undefined) return '';
  return String(id).slice(0, 8);
}

/**
 * Safely format date string
 */
export function safeDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined;
  try {
    return new Date(dateStr);
  } catch {
    return undefined;
  }
}

/**
 * Safely format date for display
 */
export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Safely get numeric value with fallback
 */
export function safeNumber(value: number | undefined, fallback: number = 0): number {
  return value ?? fallback;
}

/**
 * Array of number IDs to array of string IDs
 */
export function idsToStrings(ids: (number | undefined)[]): string[] {
  return ids.filter((id): id is number => id !== undefined).map(String);
}

/**
 * Array of string IDs to array of number IDs
 */
export function idsToNumbers(ids: string[]): number[] {
  return ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
}
