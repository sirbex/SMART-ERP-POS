/**
 * Kitchen ticket (KOT) and restaurant bill printing.
 * KOT must never include prices.
 * Guest BILL HTML is SSOT with RECEIPT via thermalGuestDocument.
 *
 * Waiters never choose a printer: station/guest-bill mappings drive
 * X-Printer-Name on the local bridge. KOT never opens the browser print dialog.
 */

import { consolidateKotLines } from '@shared/utils/consolidateKotLines';
import {
  documentCompanyHeaderHtml,
  type DocumentCompanyBranding,
} from './documentCompanyBranding';
import { printHtmlDocument } from './print';
import {
  billToThermalGuestDocument,
  buildThermalGuestDocumentHtml,
  formatGuestDocMoney,
} from './thermalGuestDocument';
import { buildThermalPrintCss } from './thermalPrintCss';
import { getCachedRestaurantStations } from './restaurantOfflineCache';

async function postToPrintBridge(
  html: string,
  printerName?: string | null,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'text/html; charset=utf-8',
    };
    const name = printerName?.trim();
    if (name) headers['X-Printer-Name'] = name;
    const bridgeRes = await fetch('http://localhost:1811/print', {
      method: 'POST',
      headers,
      body: html,
      signal: AbortSignal.timeout(2500),
    });
    return bridgeRes.ok;
  } catch {
    return false;
  }
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
    if (match?.printerName?.trim()) return match.printerName.trim();
  }
  const def = stations.find((s) => s.isDefault) || stations[0];
  return def?.printerName?.trim() || null;
}

type RestaurantPrintOptions = {
  /**
   * When false (KOT default), never open Windows/browser print UI —
   * waiters must not pick a printer; mapping + bridge only.
   */
  allowBrowserFallback?: boolean;
};

async function printHtml(
  html: string,
  printerName?: string | null,
  opts?: RestaurantPrintOptions,
): Promise<void> {
  const allowBrowser = opts?.allowBrowserFallback === true;
  const name = printerName?.trim() || null;

  if (name) {
    if (await postToPrintBridge(html, name)) return;
    if (!allowBrowser) {
      throw new Error(
        `Kitchen printer "${name}" unavailable — start the print agent on :1811 (waiters do not select printers).`,
      );
    }
  } else if (await postToPrintBridge(html, null)) {
    return;
  } else if (!allowBrowser) {
    throw new Error(
      'Print bridge offline — start the agent on :1811. Map station printers on Kitchen stations (waiters do not select printers).',
    );
  }

  // Bills without a mapped printer may still use browser print as last resort
  return printHtmlDocument(html);
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
  const steward = (input.sentByName || input.waiterName || '').trim() || null;
  const server = (input.serverName || '').trim() || null;
  if (server && steward && server === steward) {
    return { steward, server: null };
  }
  return { steward, server };
}

export async function printKitchenTicket(data: KotPrintData): Promise<void> {
  const isVoid = data.ticketKind === 'VOID';
  const consolidated = consolidateKotLines(
    data.items.map((it) => ({
      productName: it.productName,
      quantity: it.quantity,
      lineNotes: it.lineNotes ?? null,
    })),
  );
  const lines = consolidated
    .map((it) => {
      const note = it.lineNotes
        ? `<div style="font-size:14px;font-weight:700;padding-left:8px">* ${escapeHtml(it.lineNotes)}</div>`
        : '';
      return `<div style="margin:6px 0;font-weight:900"><strong style="font-size:18px">${escapeHtml(String(it.quantity))}</strong> × <span style="font-size:16px">${escapeHtml(it.productName)}</span></div>${note}`;
    })
    .join('');

  const channelLabel =
    data.orderChannel === 'TAKEAWAY'
      ? 'TAKE AWAY'
      : data.orderChannel === 'DELIVERY'
        ? 'DELIVERY'
        : null;

  const guestBlock = [
    channelLabel ? `<div><strong>${escapeHtml(channelLabel)}</strong></div>` : '',
    data.guestName ? `<div>Guest: ${escapeHtml(data.guestName)}</div>` : '',
    data.guestPhone ? `<div>Phone: ${escapeHtml(data.guestPhone)}</div>` : '',
    data.pickupLabel ? `<div>Pickup: ${escapeHtml(data.pickupLabel)}</div>` : '',
    data.deliveryAddress ? `<div>Addr: ${escapeHtml(data.deliveryAddress)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  const companyBlock = documentCompanyHeaderHtml(
    {
      companyName: data.companyName,
      companyAddress: data.companyAddress,
      companyPhone: data.companyPhone,
    },
    { mode: 'kitchen', escapeHtml },
  );

  const title = isVoid ? '*** VOID ***' : `${escapeHtml(data.station)} ORDER`;
  const staff = resolveKotStaffPrintLabels({
    sentByName: data.sentByName,
    serverName: data.serverName,
    waiterName: data.waiterName,
  });
  const html = `<!DOCTYPE html><html><head><title>${isVoid ? 'VOID' : 'KOT'} ${escapeHtml(data.kotNumber)} · ${escapeHtml(data.station)}</title>
<style>
  ${buildThermalPrintCss(80)}
  body { font-size: 16px; font-weight: 700; color: #000; padding: 8px; }
  h1 { font-size: 22px; font-weight: 900; margin: 0 0 8px; text-align: center; color: #000; ${isVoid ? 'border: 2px solid #000; padding: 6px;' : ''} }
  .meta { font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #000; }
  hr { border: none; border-top: 2px dashed #000; margin: 8px 0; }
</style></head><body>
  ${companyBlock}
  <h1>${title}</h1>
  <div class="meta">
    <div><strong>${escapeHtml(data.tableLabel)}</strong></div>
    ${guestBlock}
    <div>Station: ${escapeHtml(data.station)}</div>
    <div>${isVoid ? 'VOID' : 'KOT'}: ${escapeHtml(data.kotNumber)}</div>
    ${staff.server ? `<div>Server: ${escapeHtml(staff.server)}</div>` : ''}
    ${staff.steward ? `<div>Steward: ${escapeHtml(staff.steward)}</div>` : ''}
    ${isVoid && data.voidReason ? `<div>Reason: ${escapeHtml(data.voidReason)}</div>` : ''}
    <div>Time: ${escapeHtml(data.firedAt)}</div>
  </div>
  <hr/>
  ${lines}
  <hr/>
  <div style="text-align:center;font-size:14px;font-weight:900">${isVoid ? 'STOP / DO NOT PREPARE' : 'NO PRICES'}</div>
</body></html>`;

  await printHtml(html, data.printerName || resolveStationPrinterName(data.station), {
    allowBrowserFallback: false,
  });
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
  // Mapped guest-bill printer → silent bridge only; unmapped may use browser last resort
  await printHtml(buildRestaurantBillHtml(data), data.printerName, {
    allowBrowserFallback: !data.printerName?.trim(),
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
