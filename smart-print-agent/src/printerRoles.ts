/**
 * Local printer role mapping written by the first-launch Setup Wizard.
 * Kitchen / Bar / Receipt names must match Windows printer names exactly.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(AGENT_ROOT, 'config');
const ROLES_FILE = path.join(CONFIG_DIR, 'printer-roles.json');
const SETUP_FILE = path.join(CONFIG_DIR, 'setup-complete.json');

export type PrinterRoles = {
  receipt: string | null;
  kitchen: string | null;
  bar: string | null;
  updatedAt: string | null;
};

export function readPrinterRoles(): PrinterRoles {
  try {
    if (!existsSync(ROLES_FILE)) {
      return { receipt: null, kitchen: null, bar: null, updatedAt: null };
    }
    const raw = JSON.parse(readFileSync(ROLES_FILE, 'utf8')) as Partial<PrinterRoles>;
    return {
      receipt: typeof raw.receipt === 'string' ? raw.receipt : null,
      kitchen: typeof raw.kitchen === 'string' ? raw.kitchen : null,
      bar: typeof raw.bar === 'string' ? raw.bar : null,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    };
  } catch {
    return { receipt: null, kitchen: null, bar: null, updatedAt: null };
  }
}

export function writePrinterRoles(input: {
  receipt?: string | null;
  kitchen?: string | null;
  bar?: string | null;
}): PrinterRoles {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  const next: PrinterRoles = {
    receipt: input.receipt?.trim() || null,
    kitchen: input.kitchen?.trim() || null,
    bar: input.bar?.trim() || null,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(ROLES_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function isSetupComplete(): boolean {
  return existsSync(SETUP_FILE);
}

export function markSetupComplete(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(
    SETUP_FILE,
    JSON.stringify({ completedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
}

export function readInstallMeta(): Record<string, unknown> | null {
  try {
    const p = path.join(AGENT_ROOT, 'install-meta.json');
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) as Record<string, unknown>;
  } catch {
    return null;
  }
}
