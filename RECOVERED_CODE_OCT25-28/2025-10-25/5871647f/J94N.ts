import { Decimal } from '@prisma/client/runtime/library';

/**
 * Generate unique document number
 * @param prefix - Document prefix (e.g., "INV", "PO", "REC")
 * @param lastNumber - Last number used
 * @returns New document number
 */
export function generateDocumentNumber(prefix: string, lastNumber: number = 0): string {
  // Keep date-based grouping, but include time and a short entropy suffix to ensure uniqueness
  // Problem previously: always returned ...-000001 causing duplicate keys
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const time = `${now.getHours().toString().padStart(2, '0')}${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`; // HHmmss
  // Include an increment hint from caller (lastNumber) for compatibility and a random component
  const rand = Math.floor(Math.random() * 1000); // 000-999
  const seq = ((lastNumber + 1) % 1000).toString().padStart(3, '0');
  // Format: PREFIX-YYYYMMDD-HHMMSS-SSS (SSS: mixed of seq and rand to reduce collision risk)
  const entropy = `${seq}${rand.toString().padStart(3, '0')}`; // 6 digits
  return `${prefix}-${date}-${time}-${entropy}`;
}

/**
 * Calculate tax amount
 */
export function calculateTax(amount: Decimal | number, taxRate: Decimal | number): Decimal {
  return new Decimal(amount).mul(new Decimal(taxRate));
}

/**
 * Calculate discount amount
 */
export function calculateDiscount(
  amount: Decimal | number,
  discount: Decimal | number,
  isPercentage: boolean = false
): Decimal {
  const amt = new Decimal(amount);
  const disc = new Decimal(discount);
  
  if (isPercentage) {
    return amt.mul(disc.div(100));
  }
  return disc;
}

/**
 * Round to 2 decimal places
 */
export function round2(value: Decimal | number): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Round to 4 decimal places (for quantities)
 */
export function round4(value: Decimal | number): Decimal {
  return new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: Decimal | number, currency: string = 'USD'): string {
  const num = typeof amount === 'number' ? amount : Number(amount.toString());
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(num);
}

/**
 * Parse query pagination
 */
export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(page?: string | any, limit?: string | any): PaginationParams {
  // Handle when req.query object is passed directly
  if (typeof page === 'object' && page !== null) {
    const query = page;
    return parsePagination(query.page, query.limit);
  }
  
  const pageNum = Math.max(1, parseInt(String(page || '1'), 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit || '50'), 10)));
  const skip = (pageNum - 1) * limitNum;

  return { page: pageNum, limit: limitNum, skip };
}

/**
 * Build pagination response
 */
export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function buildPaginationResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginationResponse<T> {
  const totalPages = Math.ceil(total / params.limit);

  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1
    }
  };
}

/**
 * Sanitize search query
 */
export function sanitizeSearchQuery(query?: string): string | undefined {
  if (!query) return undefined;
  return query.trim().replace(/[^\w\s-]/g, '');
}

/**
 * Parse date range
 */
export interface DateRange {
  startDate?: Date;
  endDate?: Date;
}

export function parseDateRange(startDate?: string, endDate?: string): DateRange {
  const range: DateRange = {};

  if (startDate) {
    range.startDate = new Date(startDate);
    range.startDate.setHours(0, 0, 0, 0);
  }

  if (endDate) {
    range.endDate = new Date(endDate);
    range.endDate.setHours(23, 59, 59, 999);
  }

  return range;
}

/**
 * Build search filter for Prisma queries
 * Creates an OR clause for case-insensitive contains search across multiple fields
 * 
 * @param searchTerm - The search term to filter by
 * @param fields - Array of field names to search in
 * @param mode - Search mode, defaults to 'insensitive'
 * @returns Array of filter conditions for Prisma OR clause
 * 
 * @example
 * const where: any = {};
 * if (search) {
 *   where.OR = buildSearchFilter(search, ['name', 'phone', 'email']);
 * }
 */
export function buildSearchFilter(
  searchTerm: string,
  fields: string[],
  mode: 'insensitive' | 'default' = 'insensitive'
): Array<Record<string, any>> {
  return fields.map(field => ({
    [field]: { contains: searchTerm, mode }
  }));
}
