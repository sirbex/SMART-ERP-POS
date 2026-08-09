/**
 * Document-tax / posted-sale integrity — fail loud, never soft-pass tax SSOT.
 * Used by createSale stamps and sale tax restatement.
 */
import { Decimal } from '../utils/money.js';
import { BusinessError, ValidationError } from '../middleware/errorHandler.js';

const TOL = 0.02;

export function isUuidProductId(productId: string | null | undefined): productId is string {
  if (!productId) return false;
  if (productId.startsWith('custom_')) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    productId,
  );
}

export function money2(n: number): number {
  return Number(new Decimal(n).toFixed(2));
}

/** Line tax total must equal header tax within 2 cents. */
export function assertLineTaxEqualsHeader(
  lineTaxSum: number,
  headerTax: number,
  context: string,
): void {
  if (new Decimal(lineTaxSum).minus(headerTax).abs().greaterThan(TOL)) {
    throw new BusinessError(
      `${context}: line tax sum (${money2(lineTaxSum)}) diverges from header tax (${money2(headerTax)})`,
      'ERR_TAX_LINE_HEADER_MISMATCH',
      { lineTaxSum: money2(lineTaxSum), headerTax: money2(headerTax), context },
    );
  }
}

/**
 * Exclusive charge must be net + tax; inclusive charge must equal net (shelf).
 * Throws BusinessError — never coerce silently outside createSale inclusive trap path.
 */
export function assertExclusiveOrInclusiveCharge(params: {
  taxInclusive: boolean;
  netAfterDiscount: number;
  taxAmount: number;
  totalAmount: number;
  context: string;
}): void {
  const net = new Decimal(params.netAfterDiscount);
  const tax = new Decimal(params.taxAmount);
  const total = new Decimal(params.totalAmount);
  const expected = params.taxInclusive ? net : net.plus(tax);
  if (total.minus(expected).abs().greaterThan(TOL)) {
    throw new BusinessError(
      `${params.context}: total ${money2(params.totalAmount)} does not match ` +
        `${params.taxInclusive ? 'net (inclusive shelf)' : 'net+tax'} expected ${money2(expected.toNumber())}`,
      'ERR_TAX_TOTAL_CHARGE_MISMATCH',
      {
        taxInclusive: params.taxInclusive,
        net: money2(params.netAfterDiscount),
        tax: money2(params.taxAmount),
        total: money2(params.totalAmount),
        expected: money2(expected.toNumber()),
      },
    );
  }
}

/** Restatement must increase VAT only. */
export function assertTaxRestatementDeltaPolicy(
  postedTax: number,
  newTax: number,
): { taxDelta: number } {
  const taxDelta = money2(newTax - postedTax);
  if (taxDelta < -TOL) {
    throw new ValidationError(
      `Computed tax (${money2(newTax)}) is lower than posted tax (${money2(postedTax)}). ` +
        'Tax reductions must use credit notes, not restatement.',
    );
  }
  if (taxDelta <= TOL) {
    throw new ValidationError(
      'Computed tax matches posted tax (no omitted VAT to apply). ' +
        'Ensure products are VAT-liable and the customer is not exempt before restating.',
    );
  }
  return { taxDelta };
}

/**
 * After DB write: sale header, line sum, and optional invoice must agree.
 */
export function assertPostedTaxTriplet(params: {
  saleTax: number;
  lineTaxSum: number;
  invoiceTax?: number | null;
  context: string;
}): void {
  assertLineTaxEqualsHeader(params.lineTaxSum, params.saleTax, params.context);
  if (params.invoiceTax != null && params.invoiceTax !== undefined) {
    if (new Decimal(params.invoiceTax).minus(params.saleTax).abs().greaterThan(TOL)) {
      throw new BusinessError(
        `${params.context}: invoice tax (${money2(params.invoiceTax)}) != sale tax (${money2(params.saleTax)})`,
        'ERR_TAX_INVOICE_SALE_MISMATCH',
        {
          invoiceTax: money2(params.invoiceTax),
          saleTax: money2(params.saleTax),
        },
      );
    }
  }
}
