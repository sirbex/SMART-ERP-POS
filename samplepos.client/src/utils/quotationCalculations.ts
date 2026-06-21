/** Re-export SSOT from shared (UI + PDF use the same rules). */
export {
  calculateLineTotal,
  calculateQuotationTotals,
  hasTaxableQuotationLines,
  adjustQuotationQuantity,
  type QuotationLineCalc,
} from '@shared/utils/quotationCalculations';
