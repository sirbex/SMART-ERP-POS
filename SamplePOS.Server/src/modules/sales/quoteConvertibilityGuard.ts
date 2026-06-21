/**
 * Pre-validation guard — POS-side convert-once enforcement.
 *
 * A POS sale that arrives carrying a `quoteId` MUST be rejected up front
 * unless the quotation is still in a convertible state. Without this guard
 * the sale would deduct inventory and post a duplicate revenue row against
 * an already-converted quotation (typical cause: stale frontend state,
 * offline replay, or two-tab race).
 *
 * The list is intentionally narrow — only DRAFT, SENT, and ACCEPTED are
 * convertible from POS. CANCELLED, REJECTED, EXPIRED, and CONVERTED are all
 * terminal and produce ERR_SALE_005.
 *
 * The matching downstream SQL guard in
 * quotationRepository.markQuotationAsConverted closes the race window
 * between this pre-check and the actual conversion.
 */
import { BusinessError } from '../../middleware/errorHandler.js';

export const POS_CONVERTIBLE_QUOTE_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED'] as const;

export function assertQuoteConvertibleForPosSale(
  status: string,
  quoteIdentifier: string,
): void {
  if (!(POS_CONVERTIBLE_QUOTE_STATUSES as readonly string[]).includes(status)) {
    throw new BusinessError(
      `Cannot complete sale: quotation ${quoteIdentifier} is ${status}. ` +
      `Only DRAFT, SENT, or ACCEPTED quotations can be sold from POS.`,
      'ERR_SALE_005',
      {
        quoteIdentifier,
        currentStatus: status,
        allowedStatuses: [...POS_CONVERTIBLE_QUOTE_STATUSES],
      },
    );
  }
}
