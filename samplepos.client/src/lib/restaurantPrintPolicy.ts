/**
 * Restaurant FOH print policy SSOT — silent thermal via local agent.
 *
 * Browsers cannot print silently to a named Windows printer. Restaurant KOT/Bill
 * therefore use localhost:1811 only. Browser print dialog is an emergency opt-in
 * for terminals without the agent (off by default).
 */

const BROWSER_FALLBACK_KEY = 'pos.restaurant.allowBrowserPrintFallback.v1';

export function isRestaurantBrowserPrintFallbackEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(BROWSER_FALLBACK_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRestaurantBrowserPrintFallbackEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (enabled) localStorage.setItem(BROWSER_FALLBACK_KEY, '1');
    else localStorage.removeItem(BROWSER_FALLBACK_KEY);
  } catch {
    // ignore
  }
}

export function silentPrintFailureMessage(printerName?: string | null): string {
  const name = printerName?.trim();
  if (name) {
    return `Silent print failed for "${name}". Start the print agent on this PC (port 1811) and confirm the Windows printer name. Ticket is on KDS.`;
  }
  return 'Silent print failed — map printers on Kitchen stations and start the print agent on port 1811. Ticket is on KDS.';
}
