import { Decimal } from '@prisma/client/runtime/library';

/**
 * Generate unique document number
 * @param prefix - Document prefix (e.g., "INV", "PO", "REC")
 * @param lastNumber - Last number used
 * @returns New document number
 */
export function generateDocumentNumber(prefix: string, lastNumber: number = 0): string {
  const number = (lastNumber + 1).toString().padStart(6, '0');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${date}-${number}`;
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
