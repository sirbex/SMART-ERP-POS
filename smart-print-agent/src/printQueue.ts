/**
 * In-process print queue with retries — never silently drop a KOT after accept.
 * Integrity: callers may await SPOOL_OK (WritePrinter / HTML spool) before HTTP success.
 * OS still owns physical paper exit; we confirm spool accept, not tray sensors.
 */
import { printHtmlDocument } from './printHtml.js';
import { writeRawToPrinter } from './rawPrint.js';
import { appendAgentLog } from './lifecycle.js';

export type PrintPayloadFormat = 'html' | 'escpos';

export type JobTerminalStatus = 'SPOOL_OK' | 'FAILED' | 'DROPPED';

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
  /** When true (X-Print-Wait), fail on first error — no multi-minute retry backoff. */
  failFast?: boolean;
};

export type PrintJobRecord = {
  id: string;
  format: PrintPayloadFormat;
  printerName: string | null;
  status: 'QUEUED' | 'PRINTING' | JobTerminalStatus;
  enqueuedAt: string;
  completedAt?: string;
  attempts: number;
  lastError?: string;
};

const MAX_ATTEMPTS = 8;
/** Backoff: 2s, 5s, 10s, 20s, 40s, 60s, 60s, 60s */
const BACKOFF_MS = [2_000, 5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000];
/** Keep terminal results so clients can poll after sync wait / 202. */
const RESULT_TTL_MS = 5 * 60 * 1000;

const queue: QueuedPrintJob[] = [];
const results = new Map<string, PrintJobRecord>();
const waiters = new Map<string, Array<(rec: PrintJobRecord) => void>>();
let draining = false;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

function pruneResults(now = Date.now()): void {
  for (const [id, rec] of results) {
    if (rec.status === 'QUEUED' || rec.status === 'PRINTING') continue;
    const doneAt = rec.completedAt ? Date.parse(rec.completedAt) : 0;
    if (doneAt && now - doneAt > RESULT_TTL_MS) results.delete(id);
  }
}

function notifyWaiters(rec: PrintJobRecord): void {
  const list = waiters.get(rec.id);
  if (!list?.length) return;
  waiters.delete(rec.id);
  for (const fn of list) fn(rec);
}

function setResult(rec: PrintJobRecord): void {
  pruneResults();
  results.set(rec.id, rec);
  if (rec.status === 'SPOOL_OK' || rec.status === 'FAILED' || rec.status === 'DROPPED') {
    notifyWaiters(rec);
  }
}

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

export function getJobRecord(id: string): PrintJobRecord | null {
  pruneResults();
  return results.get(id) || null;
}

export function enqueuePrintJob(job: {
  id: string;
  format?: PrintPayloadFormat;
  /** @deprecated prefer payload + format */
  html?: string;
  payload?: string;
  printerName: string | null;
  failFast?: boolean;
}): void {
  const format = job.format || 'html';
  const payload = job.payload ?? job.html ?? '';
  const enqueuedAt = new Date().toISOString();
  queue.push({
    id: job.id,
    format,
    payload,
    printerName: job.printerName,
    enqueuedAt,
    attempts: 0,
    nextAttemptAt: Date.now(),
    failFast: job.failFast === true,
  });
  setResult({
    id: job.id,
    format,
    printerName: job.printerName,
    status: 'QUEUED',
    enqueuedAt,
    attempts: 0,
  });
  void drainQueue();
}

/**
 * Enqueue and resolve when spool write succeeds or the job is DROPPED/FAILED.
 * Used by X-Print-Wait: spool so clients never mark PRINTED on accept alone.
 */
export function enqueueAndWait(
  job: {
    id: string;
    format?: PrintPayloadFormat;
    payload?: string;
    html?: string;
    printerName: string | null;
  },
  timeoutMs: number,
): Promise<PrintJobRecord> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(job.id);
      reject(new Error(`Print spool wait timed out after ${timeoutMs}ms`));
    }, Math.max(500, timeoutMs));

    const onDone = (rec: PrintJobRecord) => {
      clearTimeout(timer);
      waiters.delete(job.id);
      resolve(rec);
    };

    const list = waiters.get(job.id) || [];
    list.push(onDone);
    waiters.set(job.id, list);

    enqueuePrintJob({ ...job, failFast: true });

    const existing = results.get(job.id);
    if (
      existing &&
      (existing.status === 'SPOOL_OK' ||
        existing.status === 'FAILED' ||
        existing.status === 'DROPPED')
    ) {
      onDone(existing);
    }
  });
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
      setResult({
        id: job.id,
        format: job.format,
        printerName: job.printerName,
        status: 'PRINTING',
        enqueuedAt: job.enqueuedAt,
        attempts: job.attempts,
        lastError: job.lastError,
      });

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
        setResult({
          id: job.id,
          format: job.format,
          printerName: job.printerName,
          status: 'SPOOL_OK',
          enqueuedAt: job.enqueuedAt,
          completedAt: new Date().toISOString(),
          attempts: job.attempts,
        });
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

        if (!job.failFast && job.attempts < MAX_ATTEMPTS) {
          const delay = BACKOFF_MS[Math.min(job.attempts - 1, BACKOFF_MS.length - 1)]!;
          job.nextAttemptAt = Date.now() + delay;
          queue.push(job);
          setResult({
            id: job.id,
            format: job.format,
            printerName: job.printerName,
            status: 'QUEUED',
            enqueuedAt: job.enqueuedAt,
            attempts: job.attempts,
            lastError: message,
          });
          appendAgentLog(`[print] retry id=${job.id} in ${delay}ms`);
        } else {
          const terminal: JobTerminalStatus = job.failFast ? 'FAILED' : 'DROPPED';
          appendAgentLog(
            `[print] ${terminal} id=${job.id} after ${job.attempts} attempts: ${message}`,
          );
          console.error(`[print] ${terminal} id=${job.id} after ${job.attempts} attempts`);
          setResult({
            id: job.id,
            format: job.format,
            printerName: job.printerName,
            status: terminal,
            enqueuedAt: job.enqueuedAt,
            completedAt: new Date().toISOString(),
            attempts: job.attempts,
            lastError: message,
          });
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
