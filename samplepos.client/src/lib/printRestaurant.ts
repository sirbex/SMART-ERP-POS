/**
 * Kitchen ticket (KOT) and restaurant bill printing.
 * KOT must never include prices. Bill includes prices.
 * Receipt after payment still uses existing printReceipt SSOT.
 */

async function printHtml(html: string, printerName?: string | null): Promise<void> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'text/html; charset=utf-8',
    };
    if (printerName?.trim()) {
      headers['X-Printer-Name'] = printerName.trim();
    }
    const bridgeRes = await fetch('http://localhost:1811/print', {
      method: 'POST',
      headers,
      body: html,
      signal: AbortSignal.timeout(1500),
    });
    if (bridgeRes.ok) return;
  } catch {
    // fall through to browser print
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error('Unable to open print frame');
  }
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
}

export interface KotPrintData {
  kotNumber: string;
  station: string;
  tableLabel: string;
  waiterName?: string | null;
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

export async function printKitchenTicket(data: KotPrintData): Promise<void> {
  const isVoid = data.ticketKind === 'VOID';
  const lines = data.items
    .map((it) => {
      const note = it.lineNotes ? `<div style="font-size:11px;padding-left:8px">* ${escapeHtml(it.lineNotes)}</div>` : '';
      return `<div style="margin:6px 0"><strong>${escapeHtml(String(it.quantity))}</strong> × ${escapeHtml(it.productName)}</div>${note}`;
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

  const title = isVoid ? '*** VOID ***' : `${escapeHtml(data.station)} ORDER`;
  const html = `<!DOCTYPE html><html><head><title>${isVoid ? 'VOID' : 'KOT'} ${escapeHtml(data.kotNumber)} · ${escapeHtml(data.station)}</title>
<style>
  body { font-family: monospace; font-size: 14px; width: 280px; margin: 0; padding: 8px; }
  h1 { font-size: 18px; margin: 0 0 8px; text-align: center; ${isVoid ? 'border: 2px solid #000; padding: 6px;' : ''} }
  .meta { font-size: 12px; margin-bottom: 8px; }
  hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
</style></head><body>
  <h1>${title}</h1>
  <div class="meta">
    <div><strong>${escapeHtml(data.tableLabel)}</strong></div>
    ${guestBlock}
    <div>Station: ${escapeHtml(data.station)}</div>
    <div>${isVoid ? 'VOID' : 'KOT'}: ${escapeHtml(data.kotNumber)}</div>
    ${data.waiterName ? `<div>Waiter: ${escapeHtml(data.waiterName)}</div>` : ''}
    ${isVoid && data.voidReason ? `<div>Reason: ${escapeHtml(data.voidReason)}</div>` : ''}
    <div>Time: ${escapeHtml(data.firedAt)}</div>
  </div>
  <hr/>
  ${lines}
  <hr/>
  <div style="text-align:center;font-size:11px">${isVoid ? 'STOP / DO NOT PREPARE' : 'NO PRICES'}</div>
</body></html>`;

  await printHtml(html, data.printerName);
}

export interface BillPrintData {
  orderNumber: string;
  tableLabel: string;
  waiterName?: string | null;
  currencySymbol?: string;
  orderChannel?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  deliveryAddress?: string | null;
  pickupLabel?: string | null;
  items: Array<{ productName: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxName?: string;
  totalAmount: number;
}

export async function printRestaurantBill(data: BillPrintData): Promise<void> {
  const fmt = (n: number) =>
    `${data.currencySymbol || ''}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const lines = data.items
    .map(
      (it) =>
        `<tr>
          <td>${escapeHtml(it.productName)}</td>
          <td style="text-align:right">${escapeHtml(String(it.quantity))}</td>
          <td style="text-align:right">${fmt(it.unitPrice)}</td>
          <td style="text-align:right">${fmt(it.lineTotal)}</td>
        </tr>`,
    )
    .join('');

  const channelLabel =
    data.orderChannel === 'TAKEAWAY'
      ? 'TAKE AWAY'
      : data.orderChannel === 'DELIVERY'
        ? 'DELIVERY'
        : null;

  const html = `<!DOCTYPE html><html><head><title>Bill ${escapeHtml(data.orderNumber)}</title>
<style>
  body { font-family: monospace; font-size: 13px; width: 300px; margin: 0; padding: 8px; }
  h1 { font-size: 16px; margin: 0 0 8px; text-align: center; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
  .tot { font-weight: bold; font-size: 14px; }
</style></head><body>
  <h1>BILL${channelLabel ? ` · ${escapeHtml(channelLabel)}` : ''}</h1>
  <div>${escapeHtml(data.tableLabel)}</div>
  <div>Order: ${escapeHtml(data.orderNumber)}</div>
  ${data.guestName ? `<div>Guest: ${escapeHtml(data.guestName)}</div>` : ''}
  ${data.guestPhone ? `<div>Phone: ${escapeHtml(data.guestPhone)}</div>` : ''}
  ${data.pickupLabel ? `<div>Pickup: ${escapeHtml(data.pickupLabel)}</div>` : ''}
  ${data.deliveryAddress ? `<div>Addr: ${escapeHtml(data.deliveryAddress)}</div>` : ''}
  ${data.waiterName ? `<div>Waiter: ${escapeHtml(data.waiterName)}</div>` : ''}
  <hr/>
  <table>
    <thead><tr><td>Item</td><td style="text-align:right">Qty</td><td style="text-align:right">Price</td><td style="text-align:right">Amt</td></tr></thead>
    <tbody>${lines}</tbody>
  </table>
  <hr/>
  <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${fmt(data.subtotal)}</span></div>
  ${data.discountAmount > 0 ? `<div style="display:flex;justify-content:space-between"><span>Discount</span><span>-${fmt(data.discountAmount)}</span></div>` : ''}
  ${data.taxAmount > 0 ? `<div style="display:flex;justify-content:space-between"><span>${escapeHtml(data.taxName || 'Tax')}</span><span>${fmt(data.taxAmount)}</span></div>` : ''}
  <div class="tot" style="display:flex;justify-content:space-between;margin-top:6px"><span>Total</span><span>${fmt(data.totalAmount)}</span></div>
  <hr/>
  <div style="text-align:center;font-size:11px">Pay at cashier</div>
</body></html>`;

  await printHtml(html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
