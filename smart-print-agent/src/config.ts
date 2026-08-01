export const AGENT_NAME = 'SMART Print Agent';
export const AGENT_VERSION = '1.3.1';
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
