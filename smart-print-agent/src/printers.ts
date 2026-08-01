import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

const execFileAsync = promisify(execFile);

export type ListedPrinter = {
  name: string;
  isDefault?: boolean;
  status?: string;
};

/** Avoid spawning Get-Printer on every KOT — Windows can take multi-seconds. */
const CACHE_TTL_MS = 60_000;
const LIST_TIMEOUT_MS = 4_000;

let cached: { at: number; printers: ListedPrinter[] } | null = null;
let inflight: Promise<ListedPrinter[]> | null = null;

/**
 * List installed OS printers. Windows uses Get-Printer; other OS return [].
 * Results are cached briefly so /print accept never waits on PowerShell.
 */
export async function listInstalledPrinters(opts?: {
  force?: boolean;
}): Promise<ListedPrinter[]> {
  if (!opts?.force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.printers;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const printers =
        os.platform() === 'win32' ? await listWindowsPrinters() : await listUnixPrinters();
      cached = { at: Date.now(), printers };
      return printers;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

async function listWindowsPrinters(): Promise<ListedPrinter[]> {
  const script = `
$ErrorActionPreference = 'Stop'
Get-Printer | Select-Object Name, PrinterStatus, @{N='IsDefault';E={ $_.Default }} |
  ConvertTo-Json -Compress
`.trim();

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, maxBuffer: 2 * 1024 * 1024, timeout: LIST_TIMEOUT_MS },
    );
    const raw = stdout.trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as
      | Array<{ Name?: string; PrinterStatus?: number | string; IsDefault?: boolean }>
      | { Name?: string; PrinterStatus?: number | string; IsDefault?: boolean };
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .map((r) => ({
        name: String(r.Name || '').trim(),
        isDefault: Boolean(r.IsDefault),
        status: r.PrinterStatus != null ? String(r.PrinterStatus) : undefined,
      }))
      .filter((p) => p.name.length > 0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to list Windows printers: ${msg}`);
  }
}

async function listUnixPrinters(): Promise<ListedPrinter[]> {
  try {
    const { stdout } = await execFileAsync('lpstat', ['-a'], {
      maxBuffer: 1024 * 1024,
      timeout: LIST_TIMEOUT_MS,
    });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ name: line.split(/\s+/)[0] || '' }))
      .filter((p) => p.name.length > 0);
  } catch {
    return [];
  }
}

export async function assertPrinterExists(printerName: string): Promise<void> {
  const name = printerName.trim();
  if (!name) return;
  const printers = await listInstalledPrinters();
  const hit = printers.some((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!hit) {
    // One forced refresh in case cache is stale after a driver install.
    const fresh = await listInstalledPrinters({ force: true });
    const hitFresh = fresh.some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!hitFresh) {
      throw new Error(
        `Printer "${name}" not found on this PC. Open SMART Print Agent /printers or Windows Settings → Printers.`,
      );
    }
  }
}

/** Warm cache at boot so first KOT does not pay Get-Printer latency on accept. */
export function warmPrinterCache(): void {
  void listInstalledPrinters().catch(() => {
    /* ignore */
  });
}
