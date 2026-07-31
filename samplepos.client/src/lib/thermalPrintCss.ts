/**
 * Thermal paper print CSS SSOT — browser / Windows driver fallback.
 *
 * Goals:
 * 1) Tell the driver the paper is 80mm (or 58mm) wide — not A4.
 * 2) Use a tall-but-sane page height so long tickets stay on one job.
 *    (3000mm made some drivers refuse the job; `auto` is poorly supported.)
 */

export type ThermalPaperMm = 58 | 80;

/** Printable content width (slightly under paper for driver margins). */
export function thermalContentWidthMm(paperMm: ThermalPaperMm): number {
  return paperMm === 58 ? 48 : 72;
}

/**
 * Practical roll height (~2ft). Covers long guest checks without the
 * "invalid paper size" failures seen with multi-meter page heights.
 */
export const THERMAL_ROLL_HEIGHT_MM = 600;

/**
 * Shared @page + body rules for receipt / bill / KOT HTML.
 * Inject into every thermal HTML document before print.
 */
export function buildThermalPrintCss(paperMm: ThermalPaperMm = 80): string {
  const contentMm = thermalContentWidthMm(paperMm);
  const contentPx = paperMm === 58 ? 180 : 272; // ~96dpi approximation

  return `
/* Thermal roll SSOT — ${paperMm}mm × ${THERMAL_ROLL_HEIGHT_MM}mm page */
@page {
  size: ${paperMm}mm ${THERMAL_ROLL_HEIGHT_MM}mm;
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
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  * {
    box-sizing: border-box;
  }
  .line, .meta-row, .tot-row, hr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
html, body {
  font-family: 'Courier New', Courier, monospace;
  width: ${contentPx}px;
  max-width: ${contentMm}mm;
  margin: 0 auto;
  color: #000;
  background: #fff;
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
 * Ensure thermal @page CSS is present in an HTML print document.
 * Used by printHtmlDocument so KOT / legacy docs also get the roll page size.
 */
export function ensureThermalPrintCss(html: string, paperMm: ThermalPaperMm = 80): string {
  if (!html || htmlHasThermalPageSize(html)) return html;
  const css = buildThermalPrintCss(paperMm);
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `<style data-thermal-roll="1">${css}</style></head>`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}<head><style data-thermal-roll="1">${css}</style></head>`);
  }
  return `<!DOCTYPE html><html><head><style data-thermal-roll="1">${css}</style></head><body>${html}</body></html>`;
}
