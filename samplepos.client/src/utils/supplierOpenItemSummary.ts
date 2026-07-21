/**
 * Supplier open-item summary — SAP FBL1N / Odoo vendor open items / Tally bill-wise pattern:
 *   - Bills (and debit notes) increase what we owe
 *   - Credit notes decrease what we owe (shown separately until applied)
 *   - Net payable = max(0, bills − open credits − unallocated payments)
 */

export type SupplierDocForOpenItem = {
  outstandingBalance?: number | string | null;
  status?: string | null;
  documentType?: string | null;
};

const CLOSED = new Set(['PAID', 'CANCELLED', 'DELETED', 'DRAFT', 'APPLIED', 'VOIDED']);

function bal(inv: SupplierDocForOpenItem): number {
  return Number(inv.outstandingBalance || 0);
}

function statusUpper(inv: SupplierDocForOpenItem): string {
  return String(inv.status || '').toUpperCase();
}

export function isSupplierCreditNote(inv: SupplierDocForOpenItem): boolean {
  return String(inv.documentType || '').toUpperCase() === 'SUPPLIER_CREDIT_NOTE';
}

export function isOpenApDocument(inv: SupplierDocForOpenItem): boolean {
  return !CLOSED.has(statusUpper(inv)) && bal(inv) > 0.009;
}

export function isOpenSupplierCreditNote(inv: SupplierDocForOpenItem): boolean {
  return isOpenApDocument(inv) && isSupplierCreditNote(inv);
}

export function isOpenSupplierBill(inv: SupplierDocForOpenItem): boolean {
  return isOpenApDocument(inv) && !isSupplierCreditNote(inv);
}

export interface SupplierOpenItemBreakdown {
  /** Sum of open bill / debit-note outstanding (positive liability). */
  billsDue: number;
  /** Sum of open credit-note outstanding (credit available to apply). */
  openCredits: number;
  openCreditCount: number;
  openBillCount: number;
  /** Net amount owed after credits (floored at 0). Does not subtract unallocated payments. */
  netPayable: number;
}

/**
 * Bill-wise open-item breakdown for supplier invoice lists.
 * Matches AP SSOT credit-note sign treatment (CN reduces payable).
 */
export function summarizeSupplierOpenItems(
  docs: SupplierDocForOpenItem[],
): SupplierOpenItemBreakdown {
  let billsDue = 0;
  let openCredits = 0;
  let openCreditCount = 0;
  let openBillCount = 0;

  for (const inv of docs) {
    if (!isOpenApDocument(inv)) continue;
    const amount = bal(inv);
    if (isSupplierCreditNote(inv)) {
      openCredits += amount;
      openCreditCount += 1;
    } else {
      billsDue += amount;
      openBillCount += 1;
    }
  }

  billsDue = Math.round(billsDue * 100) / 100;
  openCredits = Math.round(openCredits * 100) / 100;
  const netPayable = Math.max(0, Math.round((billsDue - openCredits) * 100) / 100);

  return { billsDue, openCredits, openCreditCount, openBillCount, netPayable };
}
