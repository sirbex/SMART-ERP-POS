import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(AGENT_ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'agent.log');

export const startedAtMs = Date.now();

export function agentUptimeSeconds(): number {
  return Math.floor((Date.now() - startedAtMs) / 1000);
}

export function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

export function appendAgentLog(line: string): void {
  try {
    ensureLogDir();
    const stamp = new Date().toISOString();
    appendFileSync(LOG_FILE, `${stamp} ${line}\n`, 'utf8');
  } catch {
    // never break printing on log failure
  }
}

export function readAgentLogTail(maxLines = 200): string {
  try {
    if (!existsSync(LOG_FILE)) return '';
    const raw = readFileSync(LOG_FILE, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines.slice(-Math.max(1, maxLines)).join('\n');
  } catch {
    return '';
  }
}

/** Spawn a replacement process, then exit — used by POST /restart. */
export function scheduleSelfRestart(delayMs = 400): void {
  appendAgentLog('[restart] scheduling self-restart');
  const child = spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: process.env,
    windowsHide: true,
  });
  child.unref();
  setTimeout(() => process.exit(0), delayMs);
}

export function getLogFilePath(): string {
  return LOG_FILE;
}
