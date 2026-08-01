/**
 * SMART Service Helper (127.0.0.1:1812) — start/stop Print Service + updates.
 * Browser cannot elevate; the helper runs as a Windows Service after Setup.exe.
 */

const HELPER_ORIGINS = ['http://127.0.0.1:1812', 'http://localhost:1812'] as const;

export type ServiceHelperHealth = {
  status: 'online' | 'offline';
  version: string | null;
  productVersion: string | null;
  printServiceVersion: string | null;
  printService: { installed: boolean; running: boolean; detail: string } | null;
  checkedAt: number;
};

export type UpdateCheckResult = {
  updateAvailable: boolean;
  current: { productVersion: string; printServiceVersion: string };
  latest: {
    productVersion: string;
    printServiceVersion?: string;
    notes?: string;
    packageUrl: string;
  } | null;
  source?: string;
  channel?: { manifestUrl: string; channel: string; checkIntervalMinutes: number };
  error?: string;
};

async function helperFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response | null> {
  const timeoutMs = init?.timeoutMs ?? 4000;
  const { timeoutMs: _t, ...rest } = init || {};
  for (const origin of HELPER_ORIGINS) {
    try {
      const res = await fetch(`${origin}${path}`, {
        ...rest,
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function fetchServiceHelperHealth(): Promise<ServiceHelperHealth> {
  const res = await helperFetch('/health', { timeoutMs: 1500 });
  if (!res?.ok) {
    return {
      status: 'offline',
      version: null,
      productVersion: null,
      printServiceVersion: null,
      printService: null,
      checkedAt: Date.now(),
    };
  }
  const data = (await res.json()) as {
    version?: string;
    productVersion?: string;
    printServiceVersion?: string;
    printService?: { installed: boolean; running: boolean; detail: string };
  };
  return {
    status: 'online',
    version: data.version || null,
    productVersion: data.productVersion || null,
    printServiceVersion: data.printServiceVersion || null,
    printService: data.printService || null,
    checkedAt: Date.now(),
  };
}

export async function startPrinterServiceViaHelper(): Promise<{ ok: boolean; error?: string }> {
  const res = await helperFetch('/print-service/start', {
    method: 'POST',
    timeoutMs: 30_000,
  });
  if (!res) {
    return {
      ok: false,
      error:
        'Service Helper offline. Open Start Menu → SMART-ERP-POS → SMART Print Service, or re-run Setup.exe.',
    };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error || `Start failed (${res.status})` };
  }
  return { ok: true };
}

export async function restartPrinterServiceViaHelper(): Promise<{ ok: boolean; error?: string }> {
  const res = await helperFetch('/print-service/restart', {
    method: 'POST',
    timeoutMs: 45_000,
  });
  if (!res) {
    return { ok: false, error: 'Service Helper offline' };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error || `Restart failed (${res.status})` };
  }
  return { ok: true };
}

export async function checkProductUpdate(): Promise<UpdateCheckResult | null> {
  const res = await helperFetch('/update/check', { timeoutMs: 8_000 });
  if (!res?.ok) return null;
  const body = (await res.json()) as { data?: UpdateCheckResult };
  return body.data || null;
}

export async function applyProductUpdate(): Promise<{ ok: boolean; error?: string }> {
  const res = await helperFetch('/update/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    timeoutMs: 600_000,
  });
  if (!res) return { ok: false, error: 'Service Helper offline' };
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error || `Update failed (${res.status})` };
  }
  return { ok: true };
}
