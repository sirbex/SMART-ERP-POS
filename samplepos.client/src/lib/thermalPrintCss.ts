/**
 * Thermal paper print CSS SSOT — browser / Windows driver / Print Agent PDF.
 *
 * HOW TO CHANGE PAPER SIZE YOURSELF
 * ---------------------------------
 * Edit ONE constant below: THERMAL_ROLL_HEIGHT_MM
 *   - Width is always 80mm (or 58mm when callers pass 58)
 *   - Height is THERMAL_ROLL_HEIGHT_MM (default 297 ≈ A4 height on an 80mm roll)
 *
 * Examples:
 *   297  → 80×297mm (readable; modest blank — current default)
 *   200  → shorter tickets, less blank
 *   400  → longer guest checks
 *   600  → old setting (lots of blank feed)
 *
 * After changing: refresh the PWA. Also Restart Print Service if you change
 * the agent (smart-print-agent) so PDF rendering picks up the same size.
 *
 * Do NOT use `auto` or very short estimated heights with Chrome --print-to-pdf:
 * the engine shrinks the whole ticket → tiny unreadable text.
 */

export type ThermalPaperMm = 58 | 80;

/** Printable content width (slightly under paper for driver margins). */
export function thermalContentWidthMm(paperMm: ThermalPaperMm): number {
  return paperMm === 58 ? 48 : 72;
}

/**
 * Default page height in mm for @page size: 80mm × Nmm.
 * User-tunable — see file header.
 */
export const THERMAL_ROLL_HEIGHT_MM = 297;

/** Safety ceiling if a caller passes an explicit huge height. */
export const THERMAL_ROLL_HEIGHT_MM_MAX = 600;

export type ThermalPageHeight = number | 'auto';

/**
 * Rough content height helper (diagnostics / future ESC-POS). Not used as the
 * default @page height — short estimates caused Chrome to scale text tiny.
 */
export function estimateThermalContentHeightMm(html: string): number {
  const stripped = String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  const blocks = (stripped.match(/<\/(div|p|tr|h1|h2|h3|li|hr|table)>/gi) || []).length;
  const textLen = stripped.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
  const lines = Math.max(blocks, Math.ceil(textLen / 28), 4);
  const mm = 14 + lines * 6.5;
  return Math.min(THERMAL_ROLL_HEIGHT_MM_MAX, Math.max(THERMAL_ROLL_HEIGHT_MM, Math.round(mm)));
}

/**
 * Shared @page + body rules for receipt / bill / KOT HTML.
 * Default: 80mm × THERMAL_ROLL_HEIGHT_MM (297).
 */
export function buildThermalPrintCss(
  paperMm: ThermalPaperMm = 80,
  pageHeight: ThermalPageHeight = THERMAL_ROLL_HEIGHT_MM,
): string {
  const contentMm = thermalContentWidthMm(paperMm);
  const contentPx = paperMm === 58 ? 180 : 272; // ~96dpi approximation
  const heightMm = pageHeight === 'auto' ? THERMAL_ROLL_HEIGHT_MM : pageHeight;
  const sizeValue = `${paperMm}mm ${heightMm}mm`;

  return `
/* Thermal roll SSOT — ${sizeValue}
   Tune height via THERMAL_ROLL_HEIGHT_MM in thermalPrintCss.ts */
@page {
  size: ${sizeValue};
  margin: 0;
}
@media print {
  html, body {
    width: ${contentMm}mm !important;
    max-width: ${contentMm}mm !important;
    min-height: 0 !important;
    height: auto !important;
    margin: 0 !important;
    overflow: visible !important;
    color: #000 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  * {
    box-sizing: border-box;
    color: #000 !important;
  }
  .line, .meta-row, .tot-row, hr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
html, body {
  font-family: 'Courier New', Courier, monospace;
  font-weight: 700;
  width: ${contentPx}px;
  max-width: ${contentMm}mm;
  margin: 0 auto;
  color: #000;
  background: #fff;
  -webkit-font-smoothing: none;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
`.trim();
}

/** True when HTML already declares thermal @page size (avoid double inject). */
export function htmlHasThermalPageSize(html: string): boolean {
  return /@page\s*\{[^}]*size\s*:/i.test(html);
}

/**
 * Force @page to the SSOT roll size (default 80×297mm).
 * Replaces auto / short estimates / legacy 600mm so Chrome does not shrink text.
 */
export function normalizeThermalPageSizeForPrint(html: string, paperMm: ThermalPaperMm = 80): string {
  if (!html) return html;
  const target = `size: ${paperMm}mm ${THERMAL_ROLL_HEIGHT_MM}mm`;
  return html.replace(/size:\s*\d+mm\s+(?:auto|\d+mm)/gi, target);
}

/**
 * Ensure thermal @page CSS is present in an HTML print document.
 */
export function ensureThermalPrintCss(html: string, paperMm: ThermalPaperMm = 80): string {
  if (!html) return html;
  if (htmlHasThermalPageSize(html)) {
    return normalizeThermalPageSizeForPrint(html, paperMm);
  }
  const css = buildThermalPrintCss(paperMm, THERMAL_ROLL_HEIGHT_MM);
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `<style data-thermal-roll="1">${css}</style></head>`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}<head><style data-thermal-roll="1">${css}</style></head>`);
  }
  return `<!DOCTYPE html><html><head><style data-thermal-roll="1">${css}</style></head><body>${html}</body></html>`;
}
