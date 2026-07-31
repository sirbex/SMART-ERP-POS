/**
 * Local ESC/POS print bridge (localhost:1811) — printer discovery for station routing.
 * Same host used by printRestaurant / printHtmlDocument for X-Printer-Name.
 *
 * Discovery is optional. Station→printer mapping is stored on the server and must
 * work when the agent is offline (type exact Windows printer names).
 */

export const LOCAL_PRINT_BRIDGE_ORIGIN = 'http://localhost:1811';
export const LOCAL_PRINT_BRIDGE_ORIGINS = [
  'http://localhost:1811',
  'http://127.0.0.1:1811',
] as const;

const CACHE_KEY = 'pos.printBridge.printers.v1';

export type LocalPrinterListResult = {
  printers: string[];
  bridgeOnline: boolean;
  /** True when printers came from last successful discovery cache. */
  fromCache?: boolean;
  source: 'bridge' | 'cache' | 'none';
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

export function readCachedBridgePrinters(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .map((p) => (typeof p === 'string' ? p.trim() : ''))
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function writeCachedBridgePrinters(printers: string[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const clean = [
      ...new Set(printers.map((p) => String(p || '').trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
    localStorage.setItem(CACHE_KEY, JSON.stringify(clean));
  } catch {
    // ignore quota / private mode
  }
}

async function tryListAt(
  origin: string,
  path: string,
  timeoutMs: number,
): Promise<string[] | null> {
  const res = await fetch(`${origin}${path}`, {
    method: 'GET',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  const contentType = res.headers.get('content-type') || '';
  let payload: unknown;
  if (contentType.includes('application/json')) {
    payload = await res.json();
  } else {
    const text = (await res.text()).trim();
    if (!text) return [];
    try {
      payload = JSON.parse(text);
    } catch {
      const names = text
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return names.length > 0 ? names : [];
    }
  }
  return normalizePrinterNames(payload);
}

/**
 * Ask the local print agent for installed printer names.
 * Probes localhost + 127.0.0.1 in parallel; falls back to last-known cache.
 */
export async function listLocalPrintBridgePrinters(
  opts?: { timeoutMs?: number; origin?: string },
): Promise<LocalPrinterListResult> {
  const timeoutMs = opts?.timeoutMs ?? 900;
  const origins = opts?.origin
    ? [opts.origin.replace(/\/$/, '')]
    : [...LOCAL_PRINT_BRIDGE_ORIGINS];
  const paths = ['/printers', '/api/printers', '/list-printers'];

  const attempts = origins.flatMap((origin) =>
    paths.map((path) =>
      tryListAt(origin, path, timeoutMs).catch(() => null),
    ),
  );

  const results = await Promise.all(attempts);
  for (const printers of results) {
    if (printers == null) continue;
    const unique = [...new Set(printers.map((p) => p.trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b),
    );
    writeCachedBridgePrinters(unique);
    return { printers: unique, bridgeOnline: true, source: 'bridge' };
  }

  const cached = readCachedBridgePrinters();
  if (cached.length > 0) {
    return {
      printers: cached,
      bridgeOnline: false,
      fromCache: true,
      source: 'cache',
      error:
        'Print bridge offline — showing last discovered printers. Mapping still works; type a Windows name if needed.',
    };
  }

  return {
    printers: [],
    bridgeOnline: false,
    source: 'none',
    error:
      'Print bridge offline — start the local agent on port 1811, or type each station’s exact Windows printer name.',
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
