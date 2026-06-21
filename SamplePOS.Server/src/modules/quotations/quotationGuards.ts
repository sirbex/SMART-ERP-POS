/**
 * Quotation editability and status-change guards (SSOT).
 *
 * One place defines "what state means a quotation can no longer be edited" so
 * every mutation route (update body, update items, change status, delete)
 * enforces the same rule. Mirrors SAP VA22 / Odoo `sale.order` `_check_can_be_*`
 * pattern: the model carries the rule, not each controller.
 *
 * All guards throw `ConflictError` (HTTP 409) — a 4xx client-visible signal
 * that the resource state forbids the operation, never 500.
 *
 * Invariant: a quotation is editable iff
 *   1. status is in {DRAFT, SENT, ACCEPTED} (not in a terminal state), AND
 *   2. it has not been claimed by either conversion path
 *      (`converted_to_sale_id`, `converted_to_so_id`, and `converted_to_dn_id` are all NULL).
 *
 * The two FK checks are belt-and-braces: in steady state the FK is only set
 * when status='CONVERTED' (see migration 075 `conversion_complete` CHECK),
 * but a torn write or future workflow could leave them inconsistent and the
 * guard must still refuse the edit.
 */
import { ConflictError } from '../../middleware/errorHandler.js';

/** Minimal shape required by the guards — purposely loose so callers can pass
 *  partial SELECTs without coupling to the full `QuotationDbRow` interface. */
export interface QuotationGuardShape {
  status: string;
  quote_number: string;
  converted_to_sale_id: string | null;
  converted_to_so_id: string | null;
  converted_to_dn_id?: string | null;
}

/** Statuses that forbid any further mutation of the quotation body or items. */
export const TERMINAL_QUOTATION_STATUSES = [
  'CONVERTED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
] as const;

/**
 * Throws ConflictError if the quotation cannot be edited (body or items).
 * Used by: updateQuotation, updateItemDecisions, and any future mutation.
 */
export function assertEditableQuotation(quote: QuotationGuardShape): void {
  if (quote.converted_to_sale_id) {
    throw new ConflictError(
      `Quotation ${quote.quote_number} is locked: it has been converted to sale ${quote.converted_to_sale_id}.`,
    );
  }
  if (quote.converted_to_so_id) {
    throw new ConflictError(
      `Quotation ${quote.quote_number} is locked: it has been converted to distribution sales order ${quote.converted_to_so_id}.`,
    );
  }
  if (quote.converted_to_dn_id) {
    throw new ConflictError(
      `Quotation ${quote.quote_number} is locked: it has been converted via delivery note ${quote.converted_to_dn_id}.`,
    );
  }
  if ((TERMINAL_QUOTATION_STATUSES as readonly string[]).includes(quote.status)) {
    throw new ConflictError(
      `Quotation ${quote.quote_number} is ${quote.status} and can no longer be edited.`,
    );
  }
}

/**
 * Throws ConflictError if the requested status transition is forbidden.
 *
 * Distinct from `assertEditableQuotation` because:
 *  - Status changes are sometimes allowed on a quote that is otherwise frozen
 *    (e.g. CANCELLED → DRAFT re-open, depending on business policy).
 *  - Setting status to CONVERTED manually is always forbidden — only the
 *    convert endpoint may write that state (it also claims the FK).
 *  - A quote with either FK set is irreversibly tied to a downstream document
 *    and its status MUST stay as CONVERTED.
 */
export function assertStatusChangeable(
  quote: QuotationGuardShape,
  targetStatus: string,
): void {
  if (quote.converted_to_sale_id) {
    throw new ConflictError(
      `Quotation ${quote.quote_number} is locked: converted to sale ${quote.converted_to_sale_id}.`,
    );
  }
  if (quote.converted_to_so_id) {
    throw new ConflictError(
      `Quotation ${quote.quote_number} is locked: converted to distribution sales order ${quote.converted_to_so_id}.`,
    );
  }
  if (quote.converted_to_dn_id) {
    throw new ConflictError(
      `Quotation ${quote.quote_number} is locked: converted via delivery note ${quote.converted_to_dn_id}.`,
    );
  }
  if (quote.status === 'CONVERTED') {
    throw new ConflictError(
      `Quotation ${quote.quote_number} is CONVERTED — status cannot be changed.`,
    );
  }
  if (targetStatus === 'CONVERTED') {
    throw new ConflictError(
      `Quotation ${quote.quote_number}: use the convert endpoint to mark as CONVERTED — manual status changes are not allowed.`,
    );
  }
}
