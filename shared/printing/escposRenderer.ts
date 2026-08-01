/**
 * ESC/POS renderer for thermal tickets (KOT / guest bill / receipt).
 * Pure — no DOM, no Chromium. Safe for browser and Node.
 *
 * Layout target: 80mm roll (Epson TM-T88 Font A ≈ 42 columns).
 * Do NOT use 32 columns — that prints as a left-sided 58mm ticket on 80mm paper.
 */
import type { ThermalTicket } from './thermalTicket.js';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Font A columns on 80mm thermal (512 dots / 12 = 42). */
export const ESC_POS_COLS_80MM = 42;

function bytes(...parts: Array<number | Uint8Array | string>): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (const p of parts) {
    if (typeof p === 'number') {
      chunks.push(new Uint8Array([p]));
      total += 1;
    } else if (typeof p === 'string') {
      const enc = encodePrintable(p);
      chunks.push(enc);
      total += enc.length;
    } else {
      chunks.push(p);
      total += p.length;
    }
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Map to printable Latin-1 / ASCII for common kitchen printers. */
function encodePrintable(text: string): Uint8Array {
  const s = String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '?');
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function line(text: string): Uint8Array {
  return bytes(text, LF);
}

function center(on: boolean): Uint8Array {
  return new Uint8Array([ESC, 0x61, on ? 1 : 0]);
}

function leftAlign(): Uint8Array {
  return new Uint8Array([ESC, 0x61, 0]);
}

function bold(on: boolean): Uint8Array {
  return new Uint8Array([ESC, 0x45, on ? 1 : 0]);
}

function doubleSize(on: boolean): Uint8Array {
  return new Uint8Array([GS, 0x21, on ? 0x11 : 0x00]);
}

function init(): Uint8Array {
  // ESC @ + Font A (ESC M 0) — full 80mm character width
  return new Uint8Array([ESC, 0x40, ESC, 0x4d, 0x00]);
}

/**
 * Feed past the cutter, then full cut.
 * TM-T88 / similar: print head is below the blade — without feed, the last
 * lines (footer / "STOP / DO NOT PREPARE") are cut off the ticket.
 */
function feedAndCut(): Uint8Array {
  const feeds = new Uint8Array(8).fill(LF);
  return bytes(feeds, new Uint8Array([GS, 0x56, 0x41, 0x18]));
}

function rule(): Uint8Array {
  return line('-'.repeat(ESC_POS_COLS_80MM));
}

function money(amount: number | null | undefined, symbol?: string | null): string {
  const n = Number(amount);
  const v = Number.isFinite(n) ? n.toFixed(2) : '0.00';
  const sym = (symbol || '').trim();
  return sym ? `${sym} ${v}` : v;
}

/** Left/right justified across full 80mm width. */
function pairLine(left: string, right: string, cols = ESC_POS_COLS_80MM): Uint8Array {
  let L = String(left || '');
  const R = String(right || '');
  const maxLeft = Math.max(1, cols - R.length - 1);
  if (L.length > maxLeft) L = `${L.slice(0, Math.max(0, maxLeft - 3))}...`;
  const gap = Math.max(1, cols - L.length - R.length);
  return line(L + ' '.repeat(gap) + R);
}

function wrapLines(text: string, cols = ESC_POS_COLS_80MM): string[] {
  const raw = String(text || '').trim();
  if (!raw) return [];
  if (raw.length <= cols) return [raw];
  const out: string[] = [];
  let rest = raw;
  while (rest.length > cols) {
    let breakAt = rest.lastIndexOf(' ', cols);
    if (breakAt < cols / 2) breakAt = cols;
    out.push(rest.slice(0, breakAt).trimEnd());
    rest = rest.slice(breakAt).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

function isKot(kind: ThermalTicket['kind']): boolean {
  return kind === 'KOT_FIRE' || kind === 'KOT_VOID';
}

/**
 * Render a thermal ticket to ESC/POS bytes.
 * Target: <20 ms for typical KOT / bill on modern hardware.
 */
export function renderThermalTicketEscPos(ticket: ThermalTicket): Uint8Array {
  const parts: Array<number | Uint8Array | string> = [init(), leftAlign()];

  if (ticket.companyName) {
    parts.push(center(true), bold(true));
    for (const w of wrapLines(ticket.companyName)) parts.push(line(w));
    parts.push(bold(false));
    if (ticket.companyAddress) {
      for (const w of wrapLines(ticket.companyAddress)) parts.push(line(w));
    }
    if (ticket.companyPhone) parts.push(line(ticket.companyPhone));
    parts.push(leftAlign());
  }

  parts.push(center(true), doubleSize(true), bold(true), line(ticket.title), bold(false), doubleSize(false), leftAlign());

  if (ticket.channelLabel) {
    parts.push(center(true), bold(true), line(ticket.channelLabel), bold(false), leftAlign());
  }

  parts.push(rule());

  if (isKot(ticket.kind)) {
    parts.push(bold(true), line(ticket.tableLabel), bold(false));
    if (ticket.orderChannel === 'TAKEAWAY') parts.push(line('TAKE AWAY'));
    if (ticket.orderChannel === 'DELIVERY') parts.push(line('DELIVERY'));
    if (ticket.guestName) parts.push(line(`Guest: ${ticket.guestName}`));
    if (ticket.guestPhone) parts.push(line(`Phone: ${ticket.guestPhone}`));
    if (ticket.pickupLabel) parts.push(line(`Pickup: ${ticket.pickupLabel}`));
    if (ticket.deliveryAddress) {
      for (const w of wrapLines(`Addr: ${ticket.deliveryAddress}`)) parts.push(line(w));
    }
    if (ticket.station) parts.push(line(`Station: ${ticket.station}`));
    parts.push(line(`${ticket.kind === 'KOT_VOID' ? 'VOID' : 'KOT'}: ${ticket.documentNumber}`));
    if (ticket.serverName) parts.push(line(`Server: ${ticket.serverName}`));
    if (ticket.stewardName) parts.push(line(`Steward: ${ticket.stewardName}`));
    if (ticket.voidReason) parts.push(line(`Reason: ${ticket.voidReason}`));
    parts.push(line(`Time: ${ticket.firedAt}`));
  } else if (ticket.metaRows && ticket.metaRows.length > 0) {
    for (const row of ticket.metaRows) {
      if (!row.value) continue;
      parts.push(pairLine(row.label, row.value));
    }
  } else {
    if (ticket.tableLabel) parts.push(line(ticket.tableLabel));
    parts.push(line(`Doc: ${ticket.documentNumber}`));
    parts.push(line(`Time: ${ticket.firedAt}`));
  }

  parts.push(rule());

  for (const it of ticket.items) {
    const qty = Number(it.quantity) || 0;
    if (isKot(ticket.kind)) {
      parts.push(bold(true));
      for (const w of wrapLines(`${qty} x ${it.name}`)) parts.push(line(w));
      parts.push(bold(false));
      if (it.note) parts.push(line(`  * ${it.note}`));
    } else {
      parts.push(bold(true));
      for (const w of wrapLines(it.name)) parts.push(line(w));
      parts.push(bold(false));
      if (it.note) parts.push(line(`  * ${it.note}`));
      parts.push(
        pairLine(
          `${qty} x ${money(it.unitPrice, ticket.currencySymbol)}`,
          money(it.lineTotal, ticket.currencySymbol),
        ),
      );
    }
  }

  parts.push(rule());

  if (!isKot(ticket.kind)) {
    if (ticket.subtotal != null) {
      parts.push(pairLine('Subtotal', money(ticket.subtotal, ticket.currencySymbol)));
    }
    if (ticket.discountAmount != null && Number(ticket.discountAmount) > 0) {
      parts.push(
        pairLine('Discount', `-${money(ticket.discountAmount, ticket.currencySymbol)}`),
      );
    }
    if (ticket.taxAmount != null && Number(ticket.taxAmount) > 0) {
      parts.push(
        pairLine(ticket.taxName || 'Tax', money(ticket.taxAmount, ticket.currencySymbol)),
      );
    }
    if (ticket.totalAmount != null) {
      parts.push(bold(true));
      parts.push(pairLine('TOTAL', money(ticket.totalAmount, ticket.currencySymbol)));
      parts.push(bold(false));
    }
    if (ticket.paymentRows) {
      for (const row of ticket.paymentRows) {
        parts.push(pairLine(row.label, row.value));
      }
    }
    if (ticket.customNote) {
      parts.push(rule());
      for (const w of wrapLines(ticket.customNote)) parts.push(line(w));
    }
    parts.push(rule());
  }

  const footer =
    ticket.footerLines && ticket.footerLines.length > 0
      ? ticket.footerLines
      : ticket.kind === 'KOT_VOID'
        ? ['STOP /', 'DO NOT PREPARE']
        : ticket.kind === 'KOT_FIRE'
          ? ['NO PRICES']
          : [];
  for (const f of footer) {
    parts.push(center(true), bold(true), line(f), bold(false), leftAlign());
  }

  parts.push(feedAndCut());
  return bytes(...parts);
}

export function escPosToBase64(raw: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(raw).toString('base64');
  }
  let s = '';
  for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]!);
  return btoa(s);
}
