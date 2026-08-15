/**
 * Print spool integrity SSOT — pure decisions (runtime-tested, no guessing).
 * Used by restaurant bridge + print job flush. Agent 1.4+ mirrors these rules.
 */

export const PRINT_JOB_FLUSH_MAX_AGE_MS = 20 * 60 * 1000;

export type AgentSemVer = { major: number; minor: number };

export function parseAgentVersion(v: string | null | undefined): AgentSemVer | null {
  if (!v) return null;
  const m = /^(\d+)\.(\d+)/.exec(v);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/** Agent ≥ 1.4 confirms spool before success (X-Print-Wait). */
export function agentSupportsSpoolWaitFromHealth(input: {
  version: string | null | undefined;
  status: string;
}): boolean {
  const ver = parseAgentVersion(input.version);
  if (!ver) {
    return input.status === 'online' || input.status === 'restarting';
  }
  return ver.major > 1 || (ver.major === 1 && ver.minor >= 4);
}

export function isNamedPrinterRequired(name: string | null | undefined): name is string {
  return Boolean(name?.trim());
}

export function isPrintJobFreshForFlush(
  createdAt: string | null | undefined,
  now = Date.now(),
  maxAgeMs = PRINT_JOB_FLUSH_MAX_AGE_MS,
): boolean {
  if (!createdAt) return true;
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return true;
  return now - ts <= maxAgeMs;
}

export type AgentPrintBody = {
  id?: string;
  spooled?: boolean;
  success?: boolean;
};

/**
 * Classify HTTP response BEFORE optional job poll.
 * 200+spooled = paper path confirmed; 202 = legacy accept (must poll or degrade).
 */
export function classifyAgentPrintHttp(
  status: number,
  body: AgentPrintBody | null,
  opts?: { waited?: boolean },
):
  | { kind: 'spooled_ok'; jobId?: string }
  | { kind: 'reject'; jobId?: string }
  | { kind: 'legacy_202'; jobId: string }
  | { kind: 'ok_unspecified'; jobId?: string }
  | { kind: 'client_error' }
  | { kind: 'server_error_retry' }
  | { kind: 'continue' } {
  if (status >= 400 && status < 500) return { kind: 'client_error' };
  if (status >= 500) return { kind: 'server_error_retry' };

  const jobId = typeof body?.id === 'string' ? body.id : undefined;

  if (status === 200 && body?.spooled === true) {
    return { kind: 'spooled_ok', jobId };
  }
  if (status === 200 && opts?.waited === true && body?.spooled === false) {
    return { kind: 'reject', jobId };
  }
  if (status === 202 && jobId) {
    return { kind: 'legacy_202', jobId };
  }
  if (status >= 200 && status < 300) {
    return { kind: 'ok_unspecified', jobId };
  }
  return { kind: 'continue' };
}

/** After polling GET /print/jobs/:id (or unsupported on old agents). */
export function resolveJobPollOutcome(
  poll: 'ok' | 'fail' | 'unsupported',
): 'spooled_ok' | 'reject' | 'legacy_accept' {
  if (poll === 'ok') return 'spooled_ok';
  if (poll === 'fail') return 'reject';
  return 'legacy_accept';
}

/** Bridge preflight named-only rule (health/cache applied by caller). */
export function bridgeRejectsUnnamedPrinter(printerName?: string | null): boolean {
  return !isNamedPrinterRequired(printerName);
}
