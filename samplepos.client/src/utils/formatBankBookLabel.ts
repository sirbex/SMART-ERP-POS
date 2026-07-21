/** Display label for a banking book (disambiguates duplicate names like PHARMACURE ACCOUNT). */
export function formatBankBookLabel(opts: {
  name?: string | null;
  bankName?: string | null;
  glAccountCode?: string | null;
  accountNumber?: string | null;
}): string {
  const parts: string[] = [];
  if (opts.name?.trim()) parts.push(opts.name.trim());
  if (opts.bankName?.trim()) parts.push(opts.bankName.trim());
  if (opts.glAccountCode?.trim()) parts.push(`GL ${opts.glAccountCode.trim()}`);
  if (opts.accountNumber?.trim()) parts.push(opts.accountNumber.trim());
  return parts.length > 0 ? parts.join(' · ') : '';
}

export function formatPayFromLabel(payment: {
  bankAccountName?: string | null;
  bankName?: string | null;
  glAccountCode?: string | null;
  bankAccountNumber?: string | null;
  paymentAccountCode?: string | null;
}): string {
  const fromBook = formatBankBookLabel({
    bankName: payment.bankName,
    glAccountCode: payment.glAccountCode ?? payment.paymentAccountCode,
    accountNumber: payment.bankAccountNumber,
  });
  if (fromBook) return fromBook;
  if (payment.paymentAccountCode?.trim()) {
    return `GL ${payment.paymentAccountCode.trim()}`;
  }
  return '';
}
