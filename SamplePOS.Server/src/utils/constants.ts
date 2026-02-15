/**
 * SYSTEM CONSTANTS - Single Source of Truth
 * 
 * All system-wide constants should be defined here to ensure:
 * - No duplication across modules
 * - Consistent values throughout the codebase
 * - Easy maintenance and updates
 */

// =============================================================================
// USER IDENTIFIERS
// =============================================================================

/**
 * System user UUID for automated operations.
 * Used when operations are performed by the system (not a human user).
 * Examples: Automated accounting entries, scheduled tasks, system triggers
 */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Validates if a string is the system user ID
 */
export function isSystemUser(userId: string): boolean {
    return userId === SYSTEM_USER_ID;
}

/**
 * Returns a valid user ID, falling back to SYSTEM_USER_ID if invalid
 */
export function getValidUserId(userId: string | undefined | null): string {
    if (!userId) return SYSTEM_USER_ID;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(userId) ? userId : SYSTEM_USER_ID;
}

// =============================================================================
// PAGINATION DEFAULTS
// =============================================================================

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

// =============================================================================
// DATE FORMATS
// =============================================================================

/**
 * Standard date format for API communication (ISO 8601 date only)
 * Per TIMEZONE_STRATEGY.md - dates are always YYYY-MM-DD strings
 */
export const DATE_FORMAT = 'YYYY-MM-DD';

/**
 * Standard timestamp format for audit trails (ISO 8601 with timezone)
 */
export const TIMESTAMP_FORMAT = 'YYYY-MM-DDTHH:mm:ss.SSSZ';

// =============================================================================
// FINANCIAL PRECISION
// =============================================================================

/**
 * Number of decimal places for currency amounts
 */
export const CURRENCY_PRECISION = 2;

/**
 * Number of decimal places for quantity calculations
 */
export const QUANTITY_PRECISION = 4;

// =============================================================================
// BUSINESS ID PREFIXES (for human-readable identifiers)
// =============================================================================

export const ID_PREFIXES = {
    SALE: 'SALE',
    PURCHASE_ORDER: 'PO',
    GOODS_RECEIPT: 'GR',
    INVOICE: 'INV',
    QUOTATION: 'QUO',
    EXPENSE: 'EXP',
    BANK_TRANSACTION: 'BTX',
    BANK_STATEMENT: 'STM',
    JOURNAL_ENTRY: 'JE',
    ADJUSTMENT: 'ADJ',
    CUSTOMER: 'CUST',
    SUPPLIER: 'SUPP',
    PRODUCT: 'PROD',
} as const;
