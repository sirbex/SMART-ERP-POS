/**
 * Printer Service health — cashiers never see "Print Agent" / ports / npm.
 * Heartbeat against 127.0.0.1:1811 (local only; works offline).
 */
import { LOCAL_PRINT_BRIDGE_ORIGINS } from './localPrintBridge';

export type PrinterServiceStatus = 'online' | 'restarting' | 'offline' | 'checking';

export type PrinterServiceHealth = {
  status: PrinterServiceStatus;
  version: string | null;
  uptime: number | null;
  printers: number | null;
  queueDepth: number | null;
  printing: boolean | null;
  lastOkAt: number | null;
  lastError: string | null;
  checkedAt: number;
};

const HEARTBEAT_MS = 12_000;

let cached: PrinterServiceHealth = {
  status: 'checking',
  version: null,
  uptime: null,
  printers: null,
  queueDepth: null,
  printing: null,
  lastOkAt: null,
  lastError: null,
  checkedAt: 0,
};

const listeners = new Set<(h: PrinterServiceHealth) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let restartGraceUntil = 0;

export function getPrinterServiceHealthCache(): PrinterServiceHealth {
  return cached;
}

export function subscribePrinterServiceHealth(
  fn: (h: PrinterServiceHealth) => void,
): () => void {
  listeners.add(fn);
  fn(cached);
  return () => listeners.delete(fn);
}

function emit(next: PrinterServiceHealth): void {
  cached = next;
  for (const fn of listeners) fn(next);
}

async function probeHealth(origin: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${origin}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function fetchPrinterServiceHealth(
  opts?: { timeoutMs?: number },
): Promise<PrinterServiceHealth> {
  if (inFlight) return cached;
  inFlight = true;
  const timeoutMs = opts?.timeoutMs ?? 1500;
  const now = Date.now();
  try {
    for (const origin of LOCAL_PRINT_BRIDGE_ORIGINS) {
      const payload = await probeHealth(origin, timeoutMs);
      if (!payload) continue;
      const statusRaw = String(payload.status || '').toLowerCase();
      const online = statusRaw === 'online' || statusRaw === 'ok';
      const next: PrinterServiceHealth = {
        status: online
          ? now < restartGraceUntil
            ? 'restarting'
            : 'online'
          : 'offline',
        version: typeof payload.version === 'string' ? payload.version : null,
        uptime: typeof payload.uptime === 'number' ? payload.uptime : null,
        printers: typeof payload.printers === 'number' ? payload.printers : null,
        queueDepth: typeof payload.queueDepth === 'number' ? payload.queueDepth : null,
        printing: typeof payload.printing === 'boolean' ? payload.printing : null,
        lastOkAt: online ? now : cached.lastOkAt,
        lastError: null,
        checkedAt: now,
      };
      if (online && now >= restartGraceUntil) restartGraceUntil = 0;
      emit(next);
      return next;
    }

    const next: PrinterServiceHealth = {
      status: now < restartGraceUntil ? 'restarting' : 'offline',
      version: null,
      uptime: null,
      printers: null,
      queueDepth: null,
      printing: null,
      lastOkAt: cached.lastOkAt,
      lastError: 'Printer Service is not running on this PC.',
      checkedAt: now,
    };
    emit(next);
    return next;
  } finally {
    inFlight = false;
  }
}

/** Start global heartbeat (idempotent). Call from Restaurant FOH / Diagnostics. */
export function startPrinterServiceHeartbeat(intervalMs = HEARTBEAT_MS): () => void {
  void fetchPrinterServiceHealth();
  if (!timer) {
    timer = setInterval(() => {
      void fetchPrinterServiceHealth();
    }, intervalMs);
  }
  return () => {
    // keep shared heartbeat alive for other subscribers — only clear if last listener gone
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export async function restartPrinterService(): Promise<{ ok: boolean; error?: string }> {
  restartGraceUntil = Date.now() + 8_000;
  emit({ ...cached, status: 'restarting', checkedAt: Date.now() });
  for (const origin of LOCAL_PRINT_BRIDGE_ORIGINS) {
    try {
      const res = await fetch(`${origin}/restart`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        setTimeout(() => void fetchPrinterServiceHealth(), 1200);
        setTimeout(() => void fetchPrinterServiceHealth(), 3500);
        return { ok: true };
      }
    } catch {
      // try next origin
    }
  }
  restartGraceUntil = 0;
  await fetchPrinterServiceHealth();
  return {
    ok: false,
    error:
      'Could not reach Printer Service. It may not be installed — ask a manager to run the Print Service installer on this PC.',
  };
}

export async function requestPrinterTestPrint(
  printerName?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const body = JSON.stringify({
    printer: printerName?.trim() || undefined,
    printerName: printerName?.trim() || undefined,
  });
  for (const origin of LOCAL_PRINT_BRIDGE_ORIGINS) {
    try {
      const res = await fetch(`${origin}/test-print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(45_000),
      });
      if (res.ok) return { ok: true };
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: data?.error || `Test print failed (${res.status})` };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Test print failed';
      // try next
      if (origin === LOCAL_PRINT_BRIDGE_ORIGINS[LOCAL_PRINT_BRIDGE_ORIGINS.length - 1]) {
        return { ok: false, error: message };
      }
    }
  }
  return { ok: false, error: 'Printer Service offline' };
}

export async function fetchPrinterServiceLogs(
  lines = 120,
): Promise<{ ok: boolean; text: string }> {
  const health = await fetchPrinterServiceHealth({ timeoutMs: 1200 });
  for (const origin of LOCAL_PRINT_BRIDGE_ORIGINS) {
    try {
      const res = await fetch(`${origin}/logs?lines=${lines}`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return { ok: true, text: await res.text() };
      if (res.status === 404 && health.status === 'online') {
        return {
          ok: false,
          text:
            'Logs require Printer Service v1.1+. Click Restart Service so this PC loads the new build, then Reload logs.',
        };
      }
    } catch {
      // next
    }
  }
  if (health.status === 'online') {
    return {
      ok: false,
      text:
        'Logs unavailable on this build. Click Restart Service to upgrade, then Reload logs.',
    };
  }
  return {
    ok: false,
    text: 'Logs unavailable — Printer Service is offline on this PC.',
  };
}

export function printerServiceStatusLabel(status: PrinterServiceStatus): string {
  switch (status) {
    case 'online':
      return 'Printer Service Online';
    case 'restarting':
      return 'Printer Service Restarting';
    case 'checking':
      return 'Checking Printer Service…';
    default:
      return 'Printer Service Offline';
  }
}
