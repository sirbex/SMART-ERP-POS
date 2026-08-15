export const AGENT_NAME = 'SMART Print Agent';
/** 1.4.0: named printer required + X-Print-Wait spool confirm (no ghost 202). */
export const AGENT_VERSION = '1.4.0';
export const DEFAULT_PORT = 1811;
export const DEFAULT_HOST = '127.0.0.1';

export function resolvePort(): number {
  const raw = process.env.SMART_PRINT_PORT || process.env.PORT || String(DEFAULT_PORT);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PORT;
}

export function resolveHost(): string {
  return process.env.SMART_PRINT_HOST || DEFAULT_HOST;
}
