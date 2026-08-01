/**
 * In-process print queue with retries — never silently drop a KOT after accept.
 * OS spooler still owns final delivery; this covers transient printer/agent glitches.
 */
import { printHtmlDocument } from './printHtml.js';
import { writeRawToPrinter } from './rawPrint.js';
import { appendAgentLog } from './lifecycle.js';

export type PrintPayloadFormat = 'html' | 'escpos';

export type QueuedPrintJob = {
  id: string;
  format: PrintPayloadFormat;
  /** HTML string or base64 ESC/POS */
  payload: string;
  printerName: string | null;
  enqueuedAt: string;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
};

const MAX_ATTEMPTS = 8;
/** Backoff: 2s, 5s, 10s, 20s, 40s, 60s, 60s, 60s */
const BACKOFF_MS = [2_000, 5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000];

const queue: QueuedPrintJob[] = [];
let draining = false;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

export function getQueueDepth(): number {
  return queue.length;
}

export function getQueueSnapshot(): Array<{
  id: string;
  format: PrintPayloadFormat;
  printerName: string | null;
  attempts: number;
  enqueuedAt: string;
  lastError?: string;
}> {
  return queue.map((j) => ({
    id: j.id,
    format: j.format,
    printerName: j.printerName,
    attempts: j.attempts,
    enqueuedAt: j.enqueuedAt,
    lastError: j.lastError,
  }));
}

export function enqueuePrintJob(job: {
  id: string;
  format?: PrintPayloadFormat;
  /** @deprecated prefer payload + format */
  html?: string;
  payload?: string;
  printerName: string | null;
}): void {
  const format = job.format || 'html';
  const payload = job.payload ?? job.html ?? '';
  queue.push({
    id: job.id,
    format,
    payload,
    printerName: job.printerName,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: Date.now(),
  });
  void drainQueue();
}

function scheduleWake(ms: number): void {
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    void drainQueue();
  }, Math.max(50, ms));
}

export async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const now = Date.now();
      const idx = queue.findIndex((j) => j.nextAttemptAt <= now);
      if (idx < 0) {
        const next = queue.reduce(
          (min, j) => Math.min(min, j.nextAttemptAt),
          Number.POSITIVE_INFINITY,
        );
        if (Number.isFinite(next) && queue.length > 0) {
          scheduleWake(next - now);
        }
        return;
      }

      const job = queue[idx]!;
      queue.splice(idx, 1);
      job.attempts += 1;

      try {
        const w0 = Date.now();
        if (job.format === 'escpos') {
          const raw = Buffer.from(job.payload, 'base64');
          const stages = await writeRawToPrinter(raw, job.printerName, `SMART-ESCPOS-${job.id}`);
          const workerMs = Date.now() - w0;
          appendAgentLog(
            `[print] stages id=${job.id} format=escpos assertMs=${stages.assertMs} spoolMs=${stages.spoolMs} pdfMs=0 totalMs=${workerMs}`,
          );
          appendAgentLog(
            `[print] ok id=${job.id} format=escpos printer=${job.printerName || '(default)'} attempts=${job.attempts} workerMs=${workerMs}`,
          );
          console.info(
            `[print] ok id=${job.id} format=escpos printer=${job.printerName || '(default)'} workerMs=${workerMs}`,
          );
        } else {
          await printHtmlDocument(job.payload, job.printerName);
          const workerMs = Date.now() - w0;
          appendAgentLog(
            `[print] ok id=${job.id} format=html printer=${job.printerName || '(default)'} attempts=${job.attempts} workerMs=${workerMs}`,
          );
          console.info(
            `[print] ok id=${job.id} format=html printer=${job.printerName || '(default)'} workerMs=${workerMs}`,
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        job.lastError = message;
        appendAgentLog(
          `[print] FAIL id=${job.id} format=${job.format} printer=${job.printerName || '(default)'} attempt=${job.attempts}: ${message}`,
        );
        console.error(
          `[print] FAIL id=${job.id} format=${job.format} printer=${job.printerName || '(default)'} attempt=${job.attempts}`,
          message,
        );

        if (job.attempts < MAX_ATTEMPTS) {
          const delay = BACKOFF_MS[Math.min(job.attempts - 1, BACKOFF_MS.length - 1)]!;
          job.nextAttemptAt = Date.now() + delay;
          queue.push(job);
          appendAgentLog(`[print] retry id=${job.id} in ${delay}ms`);
        } else {
          appendAgentLog(`[print] DROPPED id=${job.id} after ${job.attempts} attempts: ${message}`);
          console.error(`[print] DROPPED id=${job.id} after ${job.attempts} attempts`);
        }
      }
    }
  } finally {
    draining = false;
  }
}

export function isPrinting(): boolean {
  return draining;
}
