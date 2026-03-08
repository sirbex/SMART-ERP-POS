/**
 * Global API Error Handler
 *
 * Parses structured BusinessError responses (error_code + details)
 * from the backend and returns user-friendly messages.
 *
 * Usage:
 *   import { handleApiError } from '@/utils/errorHandler';
 *
 *   catch (error) {
 *     handleApiError(error);                     // toast.error with structured message
 *     handleApiError(error, { silent: true });    // returns message without toasting
 *     handleApiError(error, { fallback: 'Custom fallback' });
 *   }
 */
import axios, { type AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { formatCurrency } from './currency';

// ── Types ──────────────────────────────────────────────────────────

export interface ValidationDetail {
  path: string;
  message: string;
  field?: string;
}

export interface StructuredErrorResponse {
  success: false;
  error: string;
  error_code?: string;
  details?: Record<string, unknown> | ValidationDetail[];
}

export interface HandleApiErrorOptions {
  /** If true, do NOT call toast — just return the formatted message */
  silent?: boolean;
  /** Fallback message when no structured info is available */
  fallback?: string;
}

export interface ParsedApiError {
  /** Human-readable message (single paragraph) */
  message: string;
  /** The raw error_code from backend, if any */
  errorCode?: string;
  /** The raw details object from backend, if any */
  details?: Record<string, unknown>;
  /** Validation field errors (from Zod), if any */
  validationErrors?: ValidationDetail[];
  /** HTTP status code, if available */
  status?: number;
}

// ── Core parser ────────────────────────────────────────────────────

/**
 * Extract structured error info from an unknown caught error.
 */
export function parseApiError(
  error: unknown,
  fallback = 'An unexpected error occurred'
): ParsedApiError {
  if (axios.isAxiosError(error)) {
    const axErr = error as AxiosError<StructuredErrorResponse>;
    const data = axErr.response?.data;
    const status = axErr.response?.status;

    if (data && typeof data === 'object') {
      // Detect Zod validation arrays: details is [{path, message}, ...]
      const rawDetails = data.details;
      const isValidationArray =
        Array.isArray(rawDetails) &&
        rawDetails.length > 0 &&
        typeof rawDetails[0] === 'object' &&
        ('message' in rawDetails[0] || 'path' in rawDetails[0]);

      return {
        message: data.error || fallback,
        errorCode: data.error_code,
        details: isValidationArray ? undefined : (rawDetails as Record<string, unknown>),
        validationErrors: isValidationArray ? (rawDetails as ValidationDetail[]) : undefined,
        status,
      };
    }

    return {
      message: axErr.message || fallback,
      status,
    };
  }

  if (error instanceof Error) {
    return { message: error.message || fallback };
  }

  return { message: fallback };
}

// ── Friendly message builders per error-code prefix ────────────────

function formatStockError(parsed: ParsedApiError): string {
  const d = parsed.details;
  if (!d) return parsed.message;

  const product = d.product as string | undefined;
  const requested = d.requested as number | undefined;
  const available = d.available as number | undefined;
  const shortBy = d.shortBy as number | undefined;
  const expiryDate = d.expiryDate as string | undefined;

  let msg = `📦 Insufficient Stock`;
  if (product) msg += ` — ${product}`;
  msg += '\n';
  if (requested != null) msg += `Requested: ${requested}`;
  if (available != null) msg += ` | Available: ${available}`;
  if (shortBy != null) msg += ` | Short by: ${shortBy}`;
  if (expiryDate) msg += `\nExpiry constraint: ${expiryDate}`;
  return msg;
}

function formatPaymentError(parsed: ParsedApiError): string {
  const d = parsed.details;
  if (!d) return parsed.message;

  const totalAmount = d.totalAmount as number | undefined;
  const amountReceived = d.amountReceived as number | undefined;
  const shortfall = d.shortfall as number | undefined;

  let msg = '💰 Insufficient Payment\n';
  if (totalAmount != null) msg += `Total: ${formatCurrency(totalAmount)}`;
  if (amountReceived != null) msg += ` | Received: ${formatCurrency(amountReceived)}`;
  if (shortfall != null) msg += ` | Short: ${formatCurrency(shortfall)}`;
  return msg;
}

function formatUserError(parsed: ParsedApiError): string {
  const code = parsed.errorCode;
  switch (code) {
    case 'ERR_USER_001':
      return `Email already in use: ${parsed.details?.email ?? ''}`.trim();
    case 'ERR_USER_002':
      return 'Current password is incorrect';
    case 'ERR_USER_004':
      return 'Cannot delete user — they have existing transactions. Deactivate instead.';
    default:
      return parsed.message;
  }
}

function formatExpenseError(parsed: ParsedApiError): string {
  const code = parsed.errorCode;
  switch (code) {
    case 'ERR_EXPENSE_007':
      return `Category code already exists: ${parsed.details?.code ?? ''}`.trim();
    case 'ERR_EXPENSE_008':
      return 'Permission denied — you can only manage your own expenses.';
    case 'ERR_EXPENSE_009': {
      const count = parsed.details?.expenseCount;
      return `Cannot delete category — it has ${count ?? 'existing'} expense(s). Reassign them first.`;
    }
    default:
      return parsed.message;
  }
}

function formatJournalError(parsed: ParsedApiError): string {
  const d = parsed.details;
  if (!d) return parsed.message;

  const code = parsed.errorCode;
  switch (code) {
    case 'ERR_JOURNAL_002':
      return `Journal entry requires at least ${d.minimumRequired ?? 2} lines (you have ${d.lineCount ?? 0}).`;
    case 'ERR_JOURNAL_008': {
      const diff = d.difference as number | undefined;
      return `Journal entry is not balanced — difference: ${diff != null ? formatCurrency(diff) : 'unknown'}.`;
    }
    case 'ERR_JOURNAL_010':
      return 'This journal entry has already been reversed.';
    default:
      return parsed.message;
  }
}

function formatCostLayerError(parsed: ParsedApiError): string {
  const d = parsed.details;
  if (!d) return parsed.message;

  const code = parsed.errorCode;
  switch (code) {
    case 'ERR_COSTLAYER_004': {
      const requested = d.requested as number | undefined;
      const available = d.available as number | undefined;
      return `Insufficient inventory — requested ${requested ?? '?'}, available ${available ?? '?'}.`;
    }
    case 'ERR_COSTLAYER_005':
      return `Invalid costing method "${d.costingMethod}". Valid: ${d.validMethods ?? 'FIFO, AVCO, STANDARD'}`;
    default:
      return parsed.message;
  }
}

function formatPricingError(parsed: ParsedApiError): string {
  return parsed.message;
}

function formatSaleError(parsed: ParsedApiError): string {
  const d = parsed.details;
  const code = parsed.errorCode;
  if (!d) return parsed.message;

  switch (code) {
    case 'ERR_SALE_001':
      return `No cost layers found for product "${d.productId ?? ''}". Receive stock first.`;
    case 'ERR_SALE_002':
      return 'Credit sales require a customer to be selected.';
    case 'ERR_SALE_003': {
      const balance = d.outstandingBalance as number | undefined;
      return `Customer has an outstanding balance of ${balance != null ? formatCurrency(balance) : 'unknown'}. Please select a customer.`;
    }
    case 'ERR_SALE_004':
      return 'Failed to apply customer deposits. Please check the customer account.';
    case 'ERR_SALE_005': {
      const status = d.currentStatus as string | undefined;
      return `Cannot convert quotation — current status is "${status ?? 'unknown'}".`;
    }
    case 'ERR_SALE_006':
      return 'Cannot create invoice — the selected customer does not exist.';
    case 'ERR_SALE_007':
      return 'Credit sale completed but invoice creation failed. Please contact a manager.';
    case 'ERR_SALE_008': {
      const status = d.currentStatus as string | undefined;
      return `Cannot void this sale — it is currently "${status ?? 'unknown'}". Only completed sales can be voided.`;
    }
    case 'ERR_SALE_009':
      return 'A reason is required when voiding a sale.';
    case 'ERR_SALE_010': {
      const threshold = d.amountThreshold as number | undefined;
      return `Manager approval required for voiding sales over ${threshold != null ? formatCurrency(threshold) : 'the threshold'}.`;
    }
    case 'ERR_SALE_011':
      return 'Only managers or admins can approve void requests.';
    case 'ERR_SALE_012':
      return `Service products missing account configuration: ${d.products ?? ''}. Update product settings.`;
    case 'ERR_SALE_013':
      return 'Sale not found or already voided.';
    case 'ERR_PAYMENT_002': {
      const amt = d.amountReceived as number | undefined;
      return `Payment amount ${amt != null ? formatCurrency(amt) : ''} cannot be negative.`.trim();
    }
    case 'ERR_PAYMENT_003': {
      const total = d.totalAmount as number | undefined;
      const received = d.amountReceived as number | undefined;
      return `Overpayment not allowed for credit sales. Total: ${total != null ? formatCurrency(total) : '?'}, Received: ${received != null ? formatCurrency(received) : '?'}.`;
    }
    case 'ERR_PAYMENT_004': {
      const payments = d.totalPayments as number | undefined;
      const invoiceTotal = d.invoiceTotal as number | undefined;
      return `Total payments ${payments != null ? formatCurrency(payments) : '?'} exceed invoice total ${invoiceTotal != null ? formatCurrency(invoiceTotal) : '?'}.`;
    }
    default:
      return parsed.message;
  }
}

// ── Map error_code prefix → formatter ──────────────────────────────

function formatValidationErrors(parsed: ParsedApiError): string {
  const errors = parsed.validationErrors;
  if (!errors || errors.length === 0) return parsed.message;

  const bullets = errors
    .map((e) => {
      const field = e.field || e.path;
      const label = field ? humanizeField(field) : '';
      return label ? `• ${label}: ${e.message}` : `• ${e.message}`;
    })
    .join('\n');

  return `Please fix the following:\n\n${bullets}`;
}

/** Convert snake_case / camelCase field paths to readable labels */
function humanizeField(field: string): string {
  // Take the last segment (e.g. "items.0.quantity" → "quantity")
  const last = field.split('.').pop() || field;
  return last
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatByErrorCode(parsed: ParsedApiError): string {
  // Validation field-level errors always take priority
  if (parsed.validationErrors && parsed.validationErrors.length > 0) {
    return formatValidationErrors(parsed);
  }

  const code = parsed.errorCode;
  if (!code) return parsed.message;

  if (code === 'ERR_STOCK_001' || code === 'ERR_EXPIRY_001') return formatStockError(parsed);
  if (code === 'ERR_PAYMENT_001') return formatPaymentError(parsed);
  if (code.startsWith('ERR_SALE_') || code.startsWith('ERR_PAYMENT_'))
    return formatSaleError(parsed);
  if (code.startsWith('ERR_USER_')) return formatUserError(parsed);
  if (code.startsWith('ERR_EXPENSE_')) return formatExpenseError(parsed);
  if (code.startsWith('ERR_JOURNAL_')) return formatJournalError(parsed);
  if (code.startsWith('ERR_COSTLAYER_')) return formatCostLayerError(parsed);
  if (code.startsWith('ERR_PRICING_')) return formatPricingError(parsed);

  // Generic classified errors from middleware (catches all plain Error throws)
  if (code === 'ERR_NOT_FOUND')
    return `Not found: ${(parsed.details?.reason as string) || parsed.message}`;
  if (code === 'ERR_AUTH') return parsed.message;
  if (code === 'ERR_FORBIDDEN') return `Access denied: ${parsed.message}`;
  if (code === 'ERR_VALIDATION') return parsed.message;
  if (code === 'ERR_BUSINESS') return parsed.message;
  if (code === 'ERR_CONSTRAINT')
    return 'A data constraint was violated. Please check your input values.';
  if (code === 'ERR_INTERNAL') return parsed.message;

  // Unknown structured error — still better than the raw message alone
  return parsed.message;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Handle an API error: parse, format, and optionally toast.
 *
 * @returns The formatted user-facing error message.
 */
export function handleApiError(error: unknown, options: HandleApiErrorOptions = {}): string {
  const { silent = false, fallback = 'An unexpected error occurred' } = options;

  const parsed = parseApiError(error, fallback);
  const friendly = formatByErrorCode(parsed);

  if (!silent) {
    toast.error(friendly, { duration: 6000 });
  }

  return friendly;
}

/**
 * Sugar for getting just the formatted message without side-effects.
 */
export function getStructuredErrorMessage(error: unknown, fallback?: string): string {
  return handleApiError(error, { silent: true, fallback });
}
