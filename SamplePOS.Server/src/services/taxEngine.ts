/**
 * Tax Engine — arithmetic façade over shared/utils/taxCompute (SSOT).
 * No SQL. Determination lives in DocumentTaxService / documentTaxPreview.
 */

import { Decimal } from '../utils/money.js';
import {
  computeTaxes,
  type TaxComputationResultLike,
  type TaxDefinitionLike,
  type TaxLineResultLike,
  type TaxScope as SharedTaxScope,
  type TaxType as SharedTaxType,
} from '@shared/utils/taxCompute.js';

export type TaxType = SharedTaxType;
export type TaxScope = SharedTaxScope;

export interface TaxDefinition extends TaxDefinitionLike {
  scope: TaxScope;
  taxPayableAccountCode: string;
  taxReceivableAccountCode: string;
}

export interface TaxGroup {
  id: string;
  name: string;
  taxes: TaxDefinition[];
}

export type TaxLineResult = TaxLineResultLike;
export type TaxComputationResult = TaxComputationResultLike;

export class TaxEngine {
  static compute(
    amount: number | string | Decimal,
    taxes: TaxDefinitionLike[],
    quantity: number = 1,
    isSale: boolean = true,
  ): TaxComputationResult {
    return computeTaxes(amount, taxes, quantity, isSale);
  }

  static computeDocumentTaxes(
    lines: Array<{ amount: number | string; quantity: number }>,
    taxes: TaxDefinitionLike[],
    isSale: boolean = true,
  ): {
    lineResults: TaxComputationResult[];
    documentTotals: TaxComputationResult;
  } {
    const lineResults = lines.map((line) =>
      this.compute(line.amount, taxes, line.quantity, isSale),
    );

    let totalUntaxed = new Decimal(0);
    let totalTax = new Decimal(0);
    const aggregatedTaxLines: Map<string, TaxLineResult> = new Map();

    for (const result of lineResults) {
      totalUntaxed = totalUntaxed.plus(result.untaxedAmount);
      totalTax = totalTax.plus(result.totalTax);

      for (const tl of result.taxLines) {
        const existing = aggregatedTaxLines.get(tl.taxId);
        if (existing) {
          existing.baseAmount = new Decimal(existing.baseAmount).plus(tl.baseAmount).toNumber();
          existing.taxAmount = new Decimal(existing.taxAmount).plus(tl.taxAmount).toNumber();
        } else {
          aggregatedTaxLines.set(tl.taxId, { ...tl });
        }
      }
    }

    return {
      lineResults,
      documentTotals: {
        untaxedAmount: totalUntaxed.toNumber(),
        totalTax: totalTax.toNumber(),
        totalAmount: totalUntaxed.plus(totalTax).toNumber(),
        taxLines: Array.from(aggregatedTaxLines.values()),
      },
    };
  }
}

export default TaxEngine;
