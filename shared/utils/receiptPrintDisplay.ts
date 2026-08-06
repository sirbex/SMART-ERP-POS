/**
 * Receipt print tax + digital verification SSOT (thermal / PDF / ESC-POS).
 *
 * System settings:
 * - receiptShowTaxBreakdown → detailed rate lines when line tax is available
 * - receiptShowQrCode → verification QR payload (rendered by printers/HTML)
 */

export type ReceiptTaxLine = {
  /** Display label e.g. "VAT 18%" or tax name */
  label: string;
  amount: number;
  /** Rate percent when known (18 → 18) */
  rate?: number | null;
};

export type BuildReceiptTaxRowsInput = {
  /** Settings → show detailed tax breakdown */
  showTaxBreakdown: boolean;
  taxAmount: number | null | undefined;
  taxName?: string | null;
  /** Aggregated lines from sale items; optional */
  taxLines?: ReceiptTaxLine[] | null;
};

export type ReceiptTaxRow = {
  label: string;
  amount: number;
  /** When true, row is the grand tax total already shown as breakdown */
  isSummary?: boolean;
};

/**
 * Aggregate exclusive tax by rate for detailed breakdown.
 * Lines with taxAmount <= 0 are ignored.
 */
export function aggregateReceiptTaxLines(
  items: Array<{
    taxAmount?: number | null;
    taxRate?: number | null;
    taxName?: string | null;
    isTaxable?: boolean | null;
  }>,
  fallbackTaxName = 'Tax',
): ReceiptTaxLine[] {
  const byKey = new Map<string, ReceiptTaxLine>();
  for (const it of items) {
    const amount = Number(it.taxAmount || 0);
    if (!(amount > 0)) continue;
    const rateRaw = it.taxRate != null ? Number(it.taxRate) : NaN;
    // Zero/blank rate with residual amount still listed under tax name (not a "rate line").
    const rate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : null;
    if (rate == null && Number(it.taxRate) === 0) {
      // Explicit zero rate — not a real exclusive tax stamp; skip from breakdown.
      continue;
    }
    const name = (it.taxName || fallbackTaxName).trim() || fallbackTaxName;
    const key = rate != null ? `r:${rate}` : `n:${name.toLowerCase()}`;
    const label = rate != null ? `${name} ${formatRateLabel(rate)}` : name;
    const existing = byKey.get(key);
    if (existing) {
      existing.amount = roundMoney(existing.amount + amount);
    } else {
      byKey.set(key, { label, amount: roundMoney(amount), rate });
    }
  }
  return [...byKey.values()].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
}

/**
 * Build display rows for receipt totals.
 * - showTaxBreakdown + has lines → one row per rate (no duplicate header total)
 * - showTaxBreakdown + only header amount → single tax row (still "shown")
 * - !showTaxBreakdown + tax > 0 → single tax name row
 * - tax <= 0 → no rows
 */
export function buildReceiptTaxRows(input: BuildReceiptTaxRowsInput): ReceiptTaxRow[] {
  const tax = Number(input.taxAmount || 0);
  if (!(tax > 0)) return [];

  const name = (input.taxName || 'Tax').trim() || 'Tax';
  const lines = (input.taxLines || []).filter((l) => Number(l.amount) > 0);

  if (input.showTaxBreakdown && lines.length > 0) {
    const sumLines = roundMoney(lines.reduce((s, l) => s + Number(l.amount), 0));
    const rows: ReceiptTaxRow[] = lines.map((l) => ({
      label: l.label,
      amount: roundMoney(l.amount),
    }));
    // Residual header tax not explained by lines (rounding / missing line stamps)
    const residual = roundMoney(tax - sumLines);
    if (Math.abs(residual) >= 0.01) {
      rows.push({ label: `${name} (other)`, amount: residual });
    }
    return rows;
  }

  return [{ label: name, amount: roundMoney(tax) }];
}

/**
 * Verification payload for receipt QR (offline scannable text).
 * Versioned string — verifiers can parse SALE/TOTAL/TAX without server round-trip.
 */
export function buildReceiptVerificationPayload(input: {
  saleNumber: string;
  totalAmount: number;
  taxAmount?: number | null;
  saleDate?: string | null;
  companyTin?: string | null;
  currency?: string | null;
}): string {
  const parts = [
    'SPOS|v1',
    `N:${String(input.saleNumber || '').trim()}`,
    `T:${roundMoney(Number(input.totalAmount || 0)).toFixed(2)}`,
    `X:${roundMoney(Number(input.taxAmount || 0)).toFixed(2)}`,
  ];
  if (input.saleDate?.trim()) {
    parts.push(`D:${input.saleDate.trim().slice(0, 32)}`);
  }
  if (input.companyTin?.trim()) {
    parts.push(`TIN:${input.companyTin.trim()}`);
  }
  if (input.currency?.trim()) {
    parts.push(`C:${input.currency.trim().slice(0, 8)}`);
  }
  return parts.join('|');
}

export function formatRateLabel(rate: number): string {
  const n = Number(rate);
  if (!Number.isFinite(n)) return '';
  // Prefer integer display when clean (18 not 18.00)
  if (Math.abs(n - Math.round(n)) < 1e-9) return `${Math.round(n)}%`;
  return `${roundMoney(n)}%`;
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Product master tax liability summary for operators (bridge + mappings).
 *
 * Price mode (Settings → tax inclusive) is SSOT for how tax is applied at sale;
 * product liability only answers “is this SKU tax-liable and at what rate?”.
 */
export function describeProductTaxLiability(input: {
  isTaxable: boolean;
  taxRate: number;
  mappings?: Array<{ code?: string | null; name?: string | null; rate?: number | null }> | null;
  taxEnabled?: boolean | null;
  taxInclusive?: boolean | null;
}): {
  status: 'MAPPED' | 'BRIDGE' | 'EXEMPT' | 'GATED';
  headline: string;
  detail: string;
} {
  const priceMode =
    input.taxInclusive === true
      ? 'Settings: tax inclusive with price — VAT is extracted from the shelf price (total stays shelf).'
      : 'Settings: tax exclusive — VAT is added on top of the selling price when liable.';

  const maps = input.mappings || [];
  // Operator unticked VAT — product is not liable even if Tax Engine still has a mapping row.
  if (!input.isTaxable) {
    if (maps.length > 0) {
      const labels = maps
        .map((m) => {
          const rate = m.rate != null ? formatRateLabel(Number(m.rate)) : '';
          const code = (m.code || m.name || 'Tax').trim();
          return rate ? `${code} ${rate}` : code;
        })
        .join(', ');
      return {
        status: 'EXEMPT',
        headline: 'Not VAT liable (product unticked)',
        detail: `No output tax at sale. A leftover Tax Engine mapping still exists (${labels}) but does not apply while VAT liable is off — remove the mapping in Accounting → Tax Engine if obsolete. ${priceMode}`,
      };
    }
    return {
      status: 'EXEMPT',
      headline: 'Not VAT liable',
      detail: `Product VAT is off — POS will not charge tax on this SKU. ${priceMode}`,
    };
  }

  if (maps.length > 0) {
    const labels = maps
      .map((m) => {
        const rate = m.rate != null ? formatRateLabel(Number(m.rate)) : '';
        const code = (m.code || m.name || 'Tax').trim();
        return rate ? `${code} ${rate}` : code;
      })
      .join(', ');
    return {
      status: 'MAPPED',
      headline: 'Tax mapped (enterprise)',
      detail: `Mappings set the rate at sale (${labels}). Product rate below is fallback only if mapping is removed. ${priceMode}`,
    };
  }

  if (Number(input.taxRate) > 0) {
    return {
      status: 'BRIDGE',
      headline: `VAT liable at ${formatRateLabel(Number(input.taxRate))}`,
      detail: `You marked this product tax liable; POS recomputes from Settings + product. ${priceMode}`,
    };
  }

  return {
    status: 'EXEMPT',
    headline: 'VAT liable but no rate',
    detail: `Product is marked taxable but rate is 0 and there is no mapping — no tax will post. Set a rate or map in Tax Engine. ${priceMode}`,
  };
}
