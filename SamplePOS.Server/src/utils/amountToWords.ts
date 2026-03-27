/**
 * Convert a numeric amount to words for use on invoices and statements.
 * Supports Uganda Shillings (UGX) and generic currency labels.
 *
 * Examples:
 *   amountToWords(1234567)          → "One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven Uganda Shillings Only"
 *   amountToWords(0)                → "Zero Uganda Shillings Only"
 *   amountToWords(1234567, 'USD')   → "One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven USD Only"
 */

const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
];

const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

const CURRENCY_LABELS: Record<string, string> = {
    UGX: 'Uganda Shillings',
    USD: 'US Dollars',
    EUR: 'Euros',
    GBP: 'British Pounds',
    KES: 'Kenya Shillings',
    TZS: 'Tanzania Shillings',
    RWF: 'Rwanda Francs',
};

function convertChunk(n: number): string {
    if (n === 0) return '';

    const parts: string[] = [];
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;

    if (hundreds > 0) {
        parts.push(`${ones[hundreds]} Hundred`);
    }

    if (remainder > 0) {
        if (remainder < 20) {
            parts.push(ones[remainder]);
        } else {
            const t = Math.floor(remainder / 10);
            const o = remainder % 10;
            parts.push(o > 0 ? `${tens[t]}-${ones[o]}` : tens[t]);
        }
    }

    return parts.join(' ');
}

export function amountToWords(amount: number | string, currencyCode = 'UGX'): string {
    const num = Math.abs(Math.floor(Number(amount) || 0));

    if (num === 0) {
        const label = CURRENCY_LABELS[currencyCode.toUpperCase()] || currencyCode;
        return `Zero ${label} Only`;
    }

    // Split number into 3-digit chunks from right
    const chunks: number[] = [];
    let remaining = num;
    while (remaining > 0) {
        chunks.push(remaining % 1000);
        remaining = Math.floor(remaining / 1000);
    }

    const parts: string[] = [];
    for (let i = chunks.length - 1; i >= 0; i--) {
        if (chunks[i] === 0) continue;
        const chunkWords = convertChunk(chunks[i]);
        const scale = scales[i] || '';
        parts.push(scale ? `${chunkWords} ${scale}` : chunkWords);
    }

    const label = CURRENCY_LABELS[currencyCode.toUpperCase()] || currencyCode;
    return `${parts.join(' ')} ${label} Only`;
}
