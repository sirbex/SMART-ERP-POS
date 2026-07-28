/**
 * Local ESC/POS print bridge (localhost:1811) — printer discovery for station routing.
 * Same host used by printRestaurant / printHtmlDocument for X-Printer-Name.
 */

export const LOCAL_PRINT_BRIDGE_ORIGIN = 'http://localhost:1811';

export type LocalPrinterListResult = {
  printers: string[];
  bridgeOnline: boolean;
  source: 'bridge' | 'none';
  error?: string;
};

function normalizePrinterNames(payload: unknown): string[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload
      .map((p) => {
        if (typeof p === 'string') return p.trim();
        if (p && typeof p === 'object') {
          const o = p as Record<string, unknown>;
          const name = o.name ?? o.printerName ?? o.printer_name ?? o.Name;
          return typeof name === 'string' ? name.trim() : '';
        }
        return '';
      })
      .filter(Boolean);
  }
  if (typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    const nested = o.printers ?? o.data ?? o.items ?? o.result;
    return normalizePrinterNames(nested);
  }
  return [];
}

/**
 * Ask the local print agent for installed printer names.
 * Tries common bridge routes; returns empty + bridgeOnline=false when agent is down.
 */
export async function listLocalPrintBridgePrinters(
  opts?: { timeoutMs?: number; origin?: string },
): Promise<LocalPrinterListResult> {
  const origin = (opts?.origin || LOCAL_PRINT_BRIDGE_ORIGIN).replace(/\/$/, '');
  const timeoutMs = opts?.timeoutMs ?? 1500;
  const paths = ['/printers', '/api/printers', '/list-printers'];

  for (const path of paths) {
    try {
      const res = await fetch(`${origin}${path}`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      let payload: unknown;
      if (contentType.includes('application/json')) {
        payload = await res.json();
      } else {
        const text = (await res.text()).trim();
        if (!text) continue;
        try {
          payload = JSON.parse(text);
        } catch {
          // Plain newline / comma separated names
          const names = text
            .split(/[\n,;]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (names.length > 0) {
            return {
              printers: [...new Set(names)].sort((a, b) => a.localeCompare(b)),
              bridgeOnline: true,
              source: 'bridge',
            };
          }
          continue;
        }
      }
      const printers = [...new Set(normalizePrinterNames(payload))].sort((a, b) =>
        a.localeCompare(b),
      );
      if (printers.length > 0 || res.ok) {
        return { printers, bridgeOnline: true, source: 'bridge' };
      }
    } catch {
      // try next path
    }
  }

  return {
    printers: [],
    bridgeOnline: false,
    source: 'none',
    error: 'Print bridge offline — start the local agent on port 1811, or type a printer name.',
  };
}

/** Merge bridge list with already-saved station / settings names (stable select options). */
export function mergePrinterOptions(
  discovered: string[],
  known: Array<string | null | undefined>,
): string[] {
  const set = new Set<string>();
  for (const n of discovered) {
    const t = String(n || '').trim();
    if (t) set.add(t);
  }
  for (const n of known) {
    const t = String(n || '').trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
