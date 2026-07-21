import type { BankAccount } from '@shared/types/banking';

/** Liquidity bank books eligible for supplier pay-from (excludes AR, undeposited, etc.). */
export function filterPayFromAccounts(accounts: BankAccount[]): BankAccount[] {
    return accounts.filter((a) => {
        if (a.transferEligible === false) return false;
        const code = String(a.glAccountCode || '');
        if (['1200', '1015', '3050', '2100', '2200'].includes(code)) return false;
        if (code && !code.startsWith('10')) return false;
        return true;
    });
}

export function accountsForSupplierPaymentMethod(
    payFromAccounts: BankAccount[],
    method: string,
): BankAccount[] {
    const m = String(method || '').toUpperCase();
    return payFromAccounts.filter((a) => {
        const tag = String(a.glSystemAccountTag || '').toUpperCase();
        const code = String(a.glAccountCode || '');
        if (m === 'CASH') {
            return tag === 'CASH' || tag === 'PETTY_CASH' || code === '1010' || code === '1012';
        }
        if (m === 'MOBILE_MONEY') {
            return tag === 'MOBILE_MONEY' || code === '1040' || code.startsWith('104');
        }
        if (m === 'CARD') {
            return tag === 'CARD_CLEARING' || tag === 'BANK' || code.startsWith('103') || code === '1020';
        }
        // BANK_TRANSFER / CHECK — bank books only (not till cash)
        return (
            tag === 'BANK' ||
            code.startsWith('103') ||
            (!tag && code.startsWith('10') && code !== '1010' && code !== '1015')
        );
    });
}

export function methodNeedsPayFromAccount(method: string): boolean {
    const m = String(method || '').toUpperCase();
    return m === 'BANK_TRANSFER' || m === 'CHECK';
}

export function pickDefaultPayFromAccount(
    payFromAccounts: BankAccount[],
    method: string,
): string | undefined {
    const books = accountsForSupplierPaymentMethod(payFromAccounts, method);
    if (books.length === 0) return undefined;
    return (books.find((b) => b.isDefault) ?? books[0])?.id;
}
