/**
 * Pure helpers for payment WHT GL splits — unit-tested without DB.
 */

/** Supplier payment: DR AP gross / CR cash net / CR WHT payable. */
export function splitSupplierPaymentCredits(grossAmount: number, whtAmount = 0): {
  cashCredit: number;
  whtCredit: number;
  apDebit: number;
} {
  const gross = Number(grossAmount) || 0;
  const wht = whtAmount > 0.009 ? whtAmount : 0;
  if (wht > gross + 0.009) {
    throw new Error(`WHT amount (${wht}) cannot exceed payment amount (${gross})`);
  }
  const cashCredit = Math.round((gross - wht) * 100) / 100;
  return {
    apDebit: gross,
    cashCredit,
    whtCredit: Math.round(wht * 100) / 100,
  };
}

/** Customer receipt: DR cash net + DR WHT receivable / CR AR gross. */
export function splitCustomerPaymentDebits(grossAmount: number, whtAmount = 0): {
  cashDebit: number;
  whtDebit: number;
  arCredit: number;
} {
  const split = splitSupplierPaymentCredits(grossAmount, whtAmount);
  return {
    arCredit: split.apDebit,
    cashDebit: split.cashCredit,
    whtDebit: split.whtCredit,
  };
}
