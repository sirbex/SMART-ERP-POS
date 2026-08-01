/**
 * Print Job dispatcher — delivers print_jobs SSOT to the local agent (:1811).
 * Reuses existing thermal HTML renderers; browser never picks a printer.
 */

import { api } from '../utils/api';
import {
  printKitchenTicket,
  printRestaurantBill,
  type KotPrintData,
  type BillPrintData,
} from './printRestaurant';
import { brandingFromTenant } from './documentCompanyBranding';
import { startPrintPathTrace } from './printPathTiming';

export type ClientPrintDocumentType = 'KOT' | 'VOID_KOT' | 'GUEST_BILL' | 'RECEIPT';

export interface ClientPrintJob {
  id: string;
  documentType: ClientPrintDocumentType;
  targetPrinter: string | null;
  payloadJson: Record<string, unknown>;
  status?: string;
  stationCode?: string | null;
  /** Offline-only id — skip server status PATCH */
  offline?: boolean;
}

const OFFLINE_QUEUE_KEY = 'pos.printJobs.offlineQueue.v1';
const DOC_TYPES = new Set<string>(['KOT', 'VOID_KOT', 'GUEST_BILL', 'RECEIPT']);

function readOfflineQueue(): ClientPrintJob[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ClientPrintJob[]) : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(jobs: ClientPrintJob[]): void {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(jobs));
}

/** Normalize API / offline shapes into a deliverable job. */
export function normalizePrintJob(raw: unknown): ClientPrintJob | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id || '').trim();
  if (!id) return null;

  const docRaw = String(r.documentType || r.document_type || '')
    .trim()
    .toUpperCase();
  if (!DOC_TYPES.has(docRaw)) return null;

  let payload = r.payloadJson ?? r.payload_json ?? {};
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    payload = {};
  }

  const printer =
    (typeof r.targetPrinter === 'string' && r.targetPrinter.trim()) ||
    (typeof r.target_printer === 'string' && r.target_printer.trim()) ||
    null;

  return {
    id,
    documentType: docRaw as ClientPrintDocumentType,
    targetPrinter: printer,
    payloadJson: payload as Record<string, unknown>,
    status: typeof r.status === 'string' ? r.status : undefined,
    stationCode:
      (typeof r.stationCode === 'string' && r.stationCode) ||
      (typeof r.station_code === 'string' && r.station_code) ||
      null,
    offline: Boolean(r.offline),
  };
}

export function enqueueOfflinePrintJob(
  job: Omit<ClientPrintJob, 'id' | 'offline'> & { id?: string },
): ClientPrintJob {
  const full: ClientPrintJob = {
    ...job,
    id: job.id || `ofl_pj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    offline: true,
    status: 'PENDING',
  };
  const q = readOfflineQueue().filter((j) => j.id !== full.id);
  q.push(full);
  writeOfflineQueue(q);
  return full;
}

async function markJobStatus(
  job: ClientPrintJob,
  status: 'PRINTING' | 'PRINTED' | 'ERROR',
  errorMessage?: string | null,
): Promise<void> {
  if (job.offline) {
    const q = readOfflineQueue().filter((j) => j.id !== job.id);
    if (status !== 'PRINTED') {
      q.push({ ...job, status, payloadJson: job.payloadJson });
    }
    writeOfflineQueue(q);
    return;
  }
  try {
    // Short timeout — never let a hung PATCH burn the KOT UX (API default is 30s).
    await api.printJobs.updateStatus(
      job.id,
      { status, errorMessage: errorMessage ?? null },
      { timeout: 2500 },
    );
  } catch {
    // Status sync is best-effort; delivery already happened or failed locally.
  }
}

/** Fire-and-forget status PATCH — must not block accept→paper path. */
function markJobStatusBackground(
  job: ClientPrintJob,
  status: 'PRINTING' | 'PRINTED' | 'ERROR',
  errorMessage?: string | null,
): void {
  void markJobStatus(job, status, errorMessage);
}

function asKotPrintData(
  job: ClientPrintJob,
  branding: {
    companyName?: string | null;
    companyAddress?: string | null;
    companyPhone?: string | null;
  },
): KotPrintData {
  const p = job.payloadJson;
  const items = Array.isArray(p.items)
    ? (p.items as Array<{ productName: string; quantity: number; lineNotes?: string | null }>)
    : [];
  return {
    kotNumber: String(p.kotNumber || job.id),
    station: String(p.station || job.stationCode || 'KITCHEN'),
    printerName: job.targetPrinter,
    tableLabel: String(p.tableLabel || p.tableName || p.tableCode || 'Table'),
    sentByName: (p.sentByName as string | null) ?? null,
    serverName: (p.serverName as string | null) ?? null,
    waiterName: (p.waiterName as string | null) ?? null,
    firedAt:
      typeof p.firedAt === 'string'
        ? Number.isNaN(Date.parse(p.firedAt))
          ? p.firedAt
          : new Date(p.firedAt).toLocaleString()
        : new Date().toLocaleString(),
    ticketKind: p.ticketKind === 'VOID' || job.documentType === 'VOID_KOT' ? 'VOID' : 'FIRE',
    voidReason: (p.voidReason as string | null) ?? null,
    orderChannel: (p.orderChannel as string | null) ?? null,
    guestName: (p.guestName as string | null) ?? null,
    guestPhone: (p.guestPhone as string | null) ?? null,
    deliveryAddress: (p.deliveryAddress as string | null) ?? null,
    pickupLabel: (p.pickupLabel as string | null) ?? null,
    companyName: branding.companyName,
    companyAddress: branding.companyAddress,
    companyPhone: branding.companyPhone,
    items,
  };
}

function asBillPrintData(
  job: ClientPrintJob,
  branding: {
    companyName?: string | null;
    companyAddress?: string | null;
    companyPhone?: string | null;
  },
): BillPrintData {
  const p = job.payloadJson;
  return {
    orderNumber: String(p.orderNumber || ''),
    tableLabel: String(p.tableLabel || 'Table'),
    waiterName: (p.waiterName as string | null) ?? null,
    printedAt:
      typeof p.printedAt === 'string'
        ? p.printedAt
        : new Date().toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
    currencySymbol: (p.currencySymbol as string | undefined) || undefined,
    taxName: (p.taxName as string | undefined) || undefined,
    printerName: job.targetPrinter,
    orderChannel: (p.orderChannel as string | null) ?? null,
    guestName: (p.guestName as string | null) ?? null,
    guestPhone: (p.guestPhone as string | null) ?? null,
    deliveryAddress: (p.deliveryAddress as string | null) ?? null,
    pickupLabel: (p.pickupLabel as string | null) ?? null,
    companyName: branding.companyName,
    companyAddress: branding.companyAddress,
    companyPhone: branding.companyPhone,
    items: Array.isArray(p.items) ? (p.items as BillPrintData['items']) : [],
    subtotal: Number(p.subtotal || 0),
    discountAmount: Number(p.discountAmount || 0),
    taxAmount: Number(p.taxAmount || 0),
    totalAmount: Number(p.totalAmount || 0),
  };
}

/**
 * Deliver one or more print jobs to the local agent. Returns failure count.
 * Each job keeps its own targetPrinter (Kitchen vs Bar vs cashier).
 * Status PATCHes are background; jobs for different stations run in parallel.
 */
export async function dispatchPrintJobs(
  jobs: ClientPrintJob[],
  opts?: { branding?: ReturnType<typeof brandingFromTenant> | null },
): Promise<{ delivered: number; failures: number }> {
  const trace = startPrintPathTrace('dispatchPrintJobs');
  const branding = opts?.branding || {};
  let delivered = 0;
  let failures = 0;

  const seen = new Set<string>();
  const normalized = jobs
    .map((j) => normalizePrintJob(j))
    .filter((j): j is ClientPrintJob => {
      if (!j) return false;
      if (seen.has(j.id)) return false;
      seen.add(j.id);
      return true;
    });
  trace.mark(`normalized_${normalized.length}`);

  await Promise.all(
    normalized.map(async (job) => {
      const items = job.payloadJson.items;
      if (!Array.isArray(items) || items.length === 0) {
        failures += 1;
        markJobStatusBackground(job, 'ERROR', 'Print job has no line items');
        return;
      }

      markJobStatusBackground(job, 'PRINTING');
      try {
        if (job.documentType === 'GUEST_BILL' || job.documentType === 'RECEIPT') {
          await printRestaurantBill(asBillPrintData(job, branding));
        } else {
          await printKitchenTicket(asKotPrintData(job, branding));
        }
        markJobStatusBackground(job, 'PRINTED');
        delivered += 1;
      } catch (err) {
        failures += 1;
        markJobStatusBackground(
          job,
          'ERROR',
          err instanceof Error ? err.message : 'Print delivery failed',
        );
      }
    }),
  );

  trace.end({ delivered, failures });
  return { delivered, failures };
}

/** Retry offline + server pending jobs (agent back online). */
export async function flushPendingPrintJobs(opts?: {
  branding?: ReturnType<typeof brandingFromTenant> | null;
  online?: boolean;
}): Promise<{ delivered: number; failures: number }> {
  const offline = readOfflineQueue()
    .map((j) => normalizePrintJob(j))
    .filter((j): j is ClientPrintJob => !!j && j.status !== 'PRINTED');

  let serverJobs: ClientPrintJob[] = [];
  if (opts?.online !== false) {
    try {
      const res = await api.printJobs.listPending();
      const rows = (res.data.data || []) as unknown[];
      serverJobs = rows
        .map((j) => normalizePrintJob(j))
        .filter((j): j is ClientPrintJob => !!j);
    } catch {
      serverJobs = [];
    }
  }
  return dispatchPrintJobs([...offline, ...serverJobs], { branding: opts?.branding });
}
