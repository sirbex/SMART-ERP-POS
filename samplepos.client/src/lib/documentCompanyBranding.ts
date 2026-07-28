/**
 * Company header SSOT for printable documents (receipt, bill, KOT).
 * Same fields as tenant branding / invoice settings — never hardcode per module.
 */

export type DocumentCompanyBranding = {
  companyName?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
};

export function brandingFromTenant(
  branding:
    | {
        companyName?: string | null;
        companyAddress?: string | null;
        companyPhone?: string | null;
      }
    | null
    | undefined,
): DocumentCompanyBranding {
  if (!branding) return {};
  return {
    companyName: branding.companyName?.trim() || null,
    companyAddress: branding.companyAddress?.trim() || null,
    companyPhone: branding.companyPhone?.trim() || null,
  };
}

/**
 * Thermal/HTML company block.
 * - guest: full name + address + phone (bill / receipt-style)
 * - kitchen: company name only (KOT stays prep-focused, still identifiable)
 */
export function documentCompanyHeaderHtml(
  branding: DocumentCompanyBranding | undefined,
  opts: {
    mode: 'guest' | 'kitchen';
    escapeHtml: (s: string) => string;
  },
): string {
  const name = branding?.companyName?.trim();
  if (!name) return '';
  const esc = opts.escapeHtml;
  if (opts.mode === 'kitchen') {
    return `<div style="text-align:center;font-size:11px;font-weight:bold;margin-bottom:6px">${esc(name)}</div>`;
  }
  const addr = branding?.companyAddress?.trim();
  const phone = branding?.companyPhone?.trim();
  return `<div style="text-align:center;margin-bottom:8px">
    <div style="font-size:15px;font-weight:bold">${esc(name)}</div>
    ${addr ? `<div style="font-size:10px">${esc(addr)}</div>` : ''}
    ${phone ? `<div style="font-size:10px">${esc(phone)}</div>` : ''}
  </div>`;
}
