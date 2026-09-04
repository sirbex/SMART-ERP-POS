/**
 * Dual-journal reference types for sale refunds.
 * MUST remain distinct — UNIQUE(ReferenceType, ReferenceId) on ledger_transactions.
 */
export const SALE_REFUND_GL_REFERENCE = {
  revenue: 'SALE_REFUND',
  inventory: 'SALE_REFUND_COGS',
} as const;

export function assertSaleRefundGlReferenceTypesDistinct(): void {
  // Compare as string so this remains a runtime safety net if constants are edited.
  const revenue: string = SALE_REFUND_GL_REFERENCE.revenue;
  const inventory: string = SALE_REFUND_GL_REFERENCE.inventory;
  if (revenue === inventory) {
    throw new Error(
      'FATAL INV-GL-REFUND: revenue and inventory referenceType must differ ' +
        '(uq_ledger_transactions_reference)',
    );
  }
}
