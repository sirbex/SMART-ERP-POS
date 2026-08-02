/**
 * Pure tax arithmetic SSOT (client + server).
 * Mirrors SamplePOS.Server TaxEngine.compute — no I/O.
 */
import Decimal from 'decimal.js';

export type TaxType = 'PERCENTAGE' | 'FIXED';
export type TaxScope = 'SALE' | 'PURCHASE' | 'BOTH';

export interface TaxDefinitionLike {
  id: string;
  code: string;
  name: string;
  type: TaxType;
  rate: number;
  isInclusive: boolean;
  isCompound: boolean;
  sequence: number;
  scope?: TaxScope | string;
  taxPayableAccountCode?: string;
  taxReceivableAccountCode?: string;
  isActive: boolean;
}

export interface TaxLineResultLike {
  taxId: string;
  taxCode: string;
  taxName: string;
  baseAmount: number;
  taxAmount: number;
  accountCode: string;
  isInclusive: boolean;
}

export interface TaxComputationResultLike {
  untaxedAmount: number;
  totalTax: number;
  totalAmount: number;
  taxLines: TaxLineResultLike[];
}

function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Compute taxes for an amount and ordered tax definitions.
 * Pure — identical semantics to server TaxEngine.compute.
 */
export function computeTaxes(
  amount: number | string | Decimal,
  taxes: TaxDefinitionLike[],
  quantity: number = 1,
  isSale: boolean = true,
): TaxComputationResultLike {
  const originalAmount = new Decimal(amount || 0);

  if (taxes.length === 0) {
    return {
      untaxedAmount: originalAmount.toNumber(),
      totalTax: 0,
      totalAmount: originalAmount.toNumber(),
      taxLines: [],
    };
  }

  // Zero net still allows FIXED (per-unit) taxes; percentage of 0 stays 0.
  if (originalAmount.isZero() && !taxes.some((t) => t.isActive && t.type === 'FIXED')) {
    return {
      untaxedAmount: 0,
      totalTax: 0,
      totalAmount: 0,
      taxLines: [],
    };
  }

  const sortedTaxes = [...taxes]
    .filter((t) => t.isActive)
    .sort((a, b) => a.sequence - b.sequence);

  const inclusiveTaxes = sortedTaxes.filter((t) => t.isInclusive);
  const exclusiveTaxes = sortedTaxes.filter((t) => !t.isInclusive);
  const taxLines: TaxLineResultLike[] = [];

  let untaxedAmount = originalAmount;

  if (inclusiveTaxes.length > 0) {
    let combinedRate = new Decimal(0);

    for (const tax of inclusiveTaxes) {
      if (tax.type === 'FIXED') {
        const fixedTotal = new Decimal(tax.rate).times(quantity);
        untaxedAmount = untaxedAmount.minus(fixedTotal);
        taxLines.push({
          taxId: tax.id,
          taxCode: tax.code,
          taxName: tax.name,
          baseAmount: untaxedAmount.toNumber(),
          taxAmount: fixedTotal.toNumber(),
          accountCode: isSale
            ? tax.taxPayableAccountCode || '2300'
            : tax.taxReceivableAccountCode || '2300',
          isInclusive: true,
        });
      } else {
        const rate = new Decimal(tax.rate).dividedBy(100);
        if (tax.isCompound) {
          combinedRate = combinedRate.plus(rate).plus(combinedRate.times(rate));
        } else {
          combinedRate = combinedRate.plus(rate);
        }
      }
    }

    if (combinedRate.greaterThan(0)) {
      const divisor = combinedRate.plus(1);
      const baseForPercentage = roundMoney(untaxedAmount.dividedBy(divisor));
      const totalInclusiveTax = untaxedAmount.minus(baseForPercentage);
      untaxedAmount = baseForPercentage;

      let distributedTax = new Decimal(0);
      const percentageInclusiveTaxes = inclusiveTaxes.filter((t) => t.type === 'PERCENTAGE');

      for (let i = 0; i < percentageInclusiveTaxes.length; i++) {
        const tax = percentageInclusiveTaxes[i];
        const rate = new Decimal(tax.rate).dividedBy(100);
        let taxAmount: Decimal;
        if (i === percentageInclusiveTaxes.length - 1) {
          taxAmount = totalInclusiveTax.minus(distributedTax);
        } else {
          taxAmount = roundMoney(baseForPercentage.times(rate));
        }
        distributedTax = distributedTax.plus(taxAmount);
        taxLines.push({
          taxId: tax.id,
          taxCode: tax.code,
          taxName: tax.name,
          baseAmount: baseForPercentage.toNumber(),
          taxAmount: taxAmount.toNumber(),
          accountCode: isSale
            ? tax.taxPayableAccountCode || '2300'
            : tax.taxReceivableAccountCode || '2300',
          isInclusive: true,
        });
      }
    }
  }

  let runningBase = untaxedAmount;

  for (const tax of exclusiveTaxes) {
    const base = tax.isCompound ? runningBase : untaxedAmount;
    let taxAmount: Decimal;
    if (tax.type === 'FIXED') {
      taxAmount = roundMoney(new Decimal(tax.rate).times(quantity));
    } else {
      taxAmount = roundMoney(base.times(new Decimal(tax.rate).dividedBy(100)));
    }
    runningBase = runningBase.plus(taxAmount);
    taxLines.push({
      taxId: tax.id,
      taxCode: tax.code,
      taxName: tax.name,
      baseAmount: base.toNumber(),
      taxAmount: taxAmount.toNumber(),
      accountCode: isSale
        ? tax.taxPayableAccountCode || '2300'
        : tax.taxReceivableAccountCode || '2300',
      isInclusive: false,
    });
  }

  let totalTax = new Decimal(0);
  for (const line of taxLines) {
    totalTax = totalTax.plus(line.taxAmount);
  }

  const hasOnlyInclusive = exclusiveTaxes.length === 0;
  const totalAmount = hasOnlyInclusive
    ? originalAmount
    : untaxedAmount.plus(totalTax);

  return {
    untaxedAmount: untaxedAmount.toNumber(),
    totalTax: totalTax.toNumber(),
    totalAmount: totalAmount.toNumber(),
    taxLines,
  };
}
