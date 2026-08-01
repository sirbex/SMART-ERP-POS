/**
 * Kitchen ticket (KOT) and restaurant bill printing.
 * KOT must never include prices.
 * Guest BILL HTML is SSOT with RECEIPT via thermalGuestDocument.
 *
 * Thermal KOT path: Ticket model → ESC/POS → agent RAW (no Chromium).
 * HTML→PDF remains for bills/invoices and as KOT fallback on old agents.
 *
 * Expert FOH rule: waiters never choose a printer. Manager maps stations /
 * guest bill once. Print is silent via local agent (:1811 + X-Printer-Name).
 * Browser print dialog is emergency-only (Stations toggle, off by default).
 */

import { buildKotThermalTicket, resolveKotStaffLabels } from '@shared/printing/buildKotTicket';
import { renderThermalTicketEscPos } from '@shared/printing/escposRenderer';
import { renderThermalTicketHtml } from '@shared/printing/htmlRenderer';
import {
  type DocumentCompanyBranding,
} from './documentCompanyBranding';
import { printHtmlDocument } from './print';
import {
  billToThermalGuestDocument,
  buildThermalGuestDocumentHtml,
  formatGuestDocMoney,
  guestDocumentToThermalTicket,
} from './thermalGuestDocument';
import { buildThermalPrintCss } from './thermalPrintCss';
import { getCachedRestaurantStations } from './restaurantOfflineCache';
import { LOCAL_PRINT_BRIDGE_ORIGINS, readCachedBridgePrinters } from './localPrintBridge';
import {
  isRestaurantBrowserPrintFallbackEnabled,
  silentPrintFailureMessage,
} from './restaurantPrintPolicy';
import { getPrinterServiceHealthCache } from './printAgentHealth';
import { startPrintPathTrace } from './printPathTiming';

type BridgeResult = {
  ok: boolean;
  reason?: 'offline' | 'unknown_printer' | 'rejected';
  acceptMs?: number;
};

function bridgePreflight(printerName?: string | null): BridgeResult | null {
  const name = printerName?.trim() || null;
  const health = getPrinterServiceHealthCache();
  if (name) {
    if (health.status === 'offline') return { ok: false, reason: 'offline' };
    const cached = readCachedBridgePrinters();
    if (cached.length > 0) {
      const hit = cached.some((p) => p.toLowerCase() === name.toLowerCase());
      if (!hit) return { ok: false, reason: 'unknown_printer' };
    }
  } else if (health.status === 'offline') {
    return { ok: false, reason: 'offline' };
  }
  return null;
}

function finalizeBridgeMiss(
  name: string | null,
  sawUnknown: boolean,
): BridgeResult {
  const health = getPrinterServiceHealthCache();
  if (sawUnknown) return { ok: false, reason: 'unknown_printer' };
  if (health.status === 'online' || health.status === 'restarting') {
    return { ok: false, reason: name ? 'unknown_printer' : 'rejected' };
  }
  return { ok: false, reason: 'offline' };
}

/** Agent returns 200 or 202 once the job is queued (paper prints async). */
async function postToPrintBridge(
  html: string,
  printerName?: string | null,
): Promise<BridgeResult> {
  const trace = startPrintPathTrace('postToPrintBridge');
  const name = printerName?.trim() || null;
  const blocked = bridgePreflight(name);
  if (blocked) {
    trace.end({ reason: blocked.reason });
    return blocked;
  }
  trace.mark('preflight_done');

  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
  };
  if (name) headers['X-Printer-Name'] = name;

  // CRITICAL: try origins sequentially. Parallel POST to localhost + 127.0.0.1
  // both hit the same agent and enqueue TWO identical jobs → double paper.
  let sawUnknown = false;
  for (const origin of LOCAL_PRINT_BRIDGE_ORIGINS) {
    try {
      const bridgeRes = await fetch(`${origin}/print`, {
        method: 'POST',
        headers,
        body: html,
        signal: AbortSignal.timeout(1500),
      });
      if (bridgeRes.ok || bridgeRes.status === 202) {
        trace.mark('agent_responded');
        trace.end({ ok: true, origin, format: 'html' });
        return { ok: true, acceptMs: trace.elapsedMs() };
      }
      if (bridgeRes.status >= 400 && bridgeRes.status < 500) {
        sawUnknown = true;
        break;
      }
    } catch {
      // try next origin
    }
  }
  trace.mark('agent_responded');
  const miss = finalizeBridgeMiss(name, sawUnknown);
  trace.end({ reason: miss.reason });
  return miss;
}

/** RAW ESC/POS — no Chromium. Requires Print Agent ≥ 1.3.0. */
async function postEscPosToPrintBridge(
  raw: Uint8Array,
  printerName?: string | null,
): Promise<BridgeResult> {
  const trace = startPrintPathTrace('postEscPosToPrintBridge');
  const name = printerName?.trim() || null;
  const blocked = bridgePreflight(name);
  if (blocked) {
    trace.end({ reason: blocked.reason });
    return blocked;
  }
  trace.mark('preflight_done');

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'X-Print-Format': 'escpos',
  };
  if (name) headers['X-Printer-Name'] = name;

  let sawUnknown = false;
  for (const origin of LOCAL_PRINT_BRIDGE_ORIGINS) {
    try {
      const bridgeRes = await fetch(`${origin}/print`, {
        method: 'POST',
        headers,
        body: raw,
        signal: AbortSignal.timeout(1500),
      });
      if (bridgeRes.ok || bridgeRes.status === 202) {
        trace.mark('agent_responded');
        trace.end({ ok: true, origin, format: 'escpos' });
        return { ok: true, acceptMs: trace.elapsedMs() };
      }
      if (bridgeRes.status >= 400 && bridgeRes.status < 500) {
        sawUnknown = true;
        break;
      }
    } catch {
      // try next origin
    }
  }
  trace.mark('agent_responded');
  const miss = finalizeBridgeMiss(name, sawUnknown);
  trace.end({ reason: miss.reason });
  return miss;
}

function agentSupportsEscPos(): boolean {
  const health = getPrinterServiceHealthCache();
  const v = health.version;
  if (v) {
    const m = /^(\d+)\.(\d+)/.exec(v);
    if (!m) return false;
    const major = Number(m[1]);
    const minor = Number(m[2]);
    // Explicit old agent → HTML only (binary would be mis-handled as text).
    if (!(major > 1 || (major === 1 && minor >= 3))) return false;
    return true;
  }
  // Version not cached yet but agent is up — try ESC/POS (HTML fallback on miss).
  return health.status === 'online' || health.status === 'restarting';
}

/**
 * Resolve printer for a kitchen station from the offline-cached registry
 * (same SSOT managers map on Stations page). Used when the API omits printerName.
 */
export function resolveStationPrinterName(stationCode: string | null | undefined): string | null {
  const code = String(stationCode || '')
    .trim()
    .toUpperCase();
  const stations = getCachedRestaurantStations().filter((s) => s.isActive);
  if (code) {
    const match = stations.find((s) => s.code.toUpperCase() === code);
    // Matched station: use ITS printer only — never steal the default station printer
    // (that collapses BAR/PIZZA tickets onto Kitchen).
    if (match) return match.printerName?.trim() || null;
  }
  const def = stations.find((s) => s.isDefault) || stations[0];
  return def?.printerName?.trim() || null;
}

/**
 * Silent restaurant print SSOT.
 * 1) Mapped name → bridge only (never send a kitchen ticket to the wrong default printer)
 * 2) Unmapped → default bridge printer
 * 3) Browser dialog only if emergency fallback is enabled on this terminal
 */
async function printHtml(html: string, printerName?: string | null): Promise<void> {
  const name = printerName?.trim() || null;
  const allowBrowser = isRestaurantBrowserPrintFallbackEnabled();

  if (name) {
    const delivered = await postToPrintBridge(html, name);
    if (delivered.ok) return;
    if (allowBrowser) return printHtmlDocument(html);
    throw new Error(silentPrintFailureMessage(name));
  }

  const delivered = await postToPrintBridge(html, null);
  if (delivered.ok) return;
  if (allowBrowser) return printHtmlDocument(html);
  throw new Error(silentPrintFailureMessage(null));
}

export interface KotPrintData extends DocumentCompanyBranding {
  kotNumber: string;
  station: string;
  tableLabel: string;
  /** @deprecated Prefer sentByName — kept for older callers. */
  waiterName?: string | null;
  /** Login user who fired this KOT (Toast: who commanded kitchen). */
  sentByName?: string | null;
  /** Check owner / floor server when different from steward. */
  serverName?: string | null;
  firedAt: string;
  /** Phase 2.2 — optional ESC/POS bridge target */
  printerName?: string | null;
  /** VOID = cancel previously fired lines */
  ticketKind?: 'FIRE' | 'VOID' | null;
  voidReason?: string | null;
  /** Phase 2.3 */
  orderChannel?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  deliveryAddress?: string | null;
  pickupLabel?: string | null;
  items: Array<{ productName: string; quantity: number; lineNotes?: string | null }>;
}

/** Pure labels for KOT header — login firer is Steward; check owner is Server when different. */
export function resolveKotStaffPrintLabels(input: {
  sentByName?: string | null;
  serverName?: string | null;
  waiterName?: string | null;
}): { steward: string | null; server: string | null } {
  return resolveKotStaffLabels(input);
}

export async function printKitchenTicket(data: KotPrintData): Promise<void> {
  const ticket = buildKotThermalTicket({
    kotNumber: data.kotNumber,
    station: data.station,
    tableLabel: data.tableLabel,
    waiterName: data.waiterName,
    sentByName: data.sentByName,
    serverName: data.serverName,
    firedAt: data.firedAt,
    ticketKind: data.ticketKind,
    voidReason: data.voidReason,
    orderChannel: data.orderChannel,
    guestName: data.guestName,
    guestPhone: data.guestPhone,
    deliveryAddress: data.deliveryAddress,
    pickupLabel: data.pickupLabel,
    companyName: data.companyName,
    companyAddress: data.companyAddress,
    companyPhone: data.companyPhone,
    items: data.items,
  });

  const printer = data.printerName || resolveStationPrinterName(data.station);
  const allowBrowser = isRestaurantBrowserPrintFallbackEnabled();

  // Primary: ESC/POS RAW (near-instant). Fallback: HTML→PDF for agents < 1.3.0.
  if (agentSupportsEscPos()) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const raw = renderThermalTicketEscPos(ticket);
    const renderMs =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    if (typeof console !== 'undefined' && renderMs > 20) {
      console.info(`[kot] escpos renderMs=${renderMs.toFixed(1)} (SLO <20ms)`);
    }
    const delivered = await postEscPosToPrintBridge(raw, printer);
    if (delivered.ok) return;
  }

  const html = renderThermalTicketHtml(ticket, buildThermalPrintCss(80));
  if (printer) {
    const delivered = await postToPrintBridge(html, printer);
    if (delivered.ok) return;
    if (allowBrowser) return printHtmlDocument(html);
    throw new Error(silentPrintFailureMessage(printer));
  }
  await printHtml(html, printer);
}

export interface BillPrintData extends DocumentCompanyBranding {
  orderNumber: string;
  tableLabel: string;
  waiterName?: string | null;
  /** When the bill was printed (defaults to now if omitted). */
  printedAt?: string | null;
  currencySymbol?: string;
  orderChannel?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  deliveryAddress?: string | null;
  pickupLabel?: string | null;
  /** Default guest-bill printer — same bridge routing as KOT (X-Printer-Name). */
  printerName?: string | null;
  items: Array<{
    productId?: string | null;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    lineNotes?: string | null;
  }>;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxName?: string;
  totalAmount: number;
}

/** @deprecated Prefer formatGuestDocMoney — kept for evidence import stability. */
export function formatBillMoney(amount: number, _currencySymbol?: string | null): string {
  return formatGuestDocMoney(amount);
}

/** Pure HTML builder — SSOT with receipt via buildThermalGuestDocumentHtml. */
export function buildRestaurantBillHtml(data: BillPrintData): string {
  return buildThermalGuestDocumentHtml(billToThermalGuestDocument(data));
}

export async function printRestaurantBill(data: BillPrintData): Promise<void> {
  const doc = billToThermalGuestDocument(data);
  const printer = data.printerName?.trim() || null;

  // Same immediate path as KOT — ESC/POS RAW at 80mm width (no Chromium).
  if (agentSupportsEscPos()) {
    const ticket = guestDocumentToThermalTicket(doc);
    if (data.currencySymbol) ticket.currencySymbol = data.currencySymbol;
    const raw = renderThermalTicketEscPos(ticket);
    const delivered = await postEscPosToPrintBridge(raw, printer);
    if (delivered.ok) return;
  }

  await printHtml(buildThermalGuestDocumentHtml(doc), printer);
}
