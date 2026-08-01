/**
 * HTML renderer for thermal tickets — fallback / A4-adjacent path.
 * Same Ticket model as EscPosRenderer; CSS injected by caller.
 */
import type { ThermalTicket } from './thermalTicket.js';

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderThermalTicketHtml(ticket: ThermalTicket, thermalCss: string): string {
  const isVoid = ticket.kind === 'KOT_VOID';
  const lines = ticket.items
    .map((it) => {
      const note = it.note
        ? `<div style="font-size:14px;font-weight:700;padding-left:8px">* ${escapeHtml(it.note)}</div>`
        : '';
      return `<div style="margin:6px 0;font-weight:900"><strong style="font-size:18px">${escapeHtml(String(it.quantity))}</strong> × <span style="font-size:16px">${escapeHtml(it.name)}</span></div>${note}`;
    })
    .join('');

  const channelLabel =
    ticket.orderChannel === 'TAKEAWAY'
      ? 'TAKE AWAY'
      : ticket.orderChannel === 'DELIVERY'
        ? 'DELIVERY'
        : null;

  const guestBlock = [
    channelLabel ? `<div><strong>${escapeHtml(channelLabel)}</strong></div>` : '',
    ticket.guestName ? `<div>Guest: ${escapeHtml(ticket.guestName)}</div>` : '',
    ticket.guestPhone ? `<div>Phone: ${escapeHtml(ticket.guestPhone)}</div>` : '',
    ticket.pickupLabel ? `<div>Pickup: ${escapeHtml(ticket.pickupLabel)}</div>` : '',
    ticket.deliveryAddress ? `<div>Addr: ${escapeHtml(ticket.deliveryAddress)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  const companyBlock = ticket.companyName
    ? `<div style="text-align:center;font-weight:900;margin-bottom:6px">${escapeHtml(ticket.companyName)}</div>`
    : '';

  const footer =
    ticket.footerLines && ticket.footerLines.length > 0
      ? ticket.footerLines.map((f) => escapeHtml(f)).join('<br/>')
      : isVoid
        ? 'STOP /<br/>DO NOT PREPARE'
        : 'NO PRICES';

  const docLabel = isVoid ? 'VOID' : 'KOT';

  return `<!DOCTYPE html><html><head><title>${docLabel} ${escapeHtml(ticket.documentNumber)} · ${escapeHtml(ticket.station || '')}</title>
<style>
  ${thermalCss}
  body { font-size: 16px; font-weight: 700; color: #000; padding: 8px; }
  h1 { font-size: 22px; font-weight: 900; margin: 0 0 8px; text-align: center; color: #000; ${isVoid ? 'border: 2px solid #000; padding: 6px;' : ''} }
  .meta { font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #000; }
  hr { border: none; border-top: 2px dashed #000; margin: 8px 0; }
</style></head><body>
  ${companyBlock}
  <h1>${escapeHtml(ticket.title)}</h1>
  <div class="meta">
    <div><strong>${escapeHtml(ticket.tableLabel)}</strong></div>
    ${guestBlock}
    ${ticket.station ? `<div>Station: ${escapeHtml(ticket.station)}</div>` : ''}
    <div>${docLabel}: ${escapeHtml(ticket.documentNumber)}</div>
    ${ticket.serverName ? `<div>Server: ${escapeHtml(ticket.serverName)}</div>` : ''}
    ${ticket.stewardName ? `<div>Steward: ${escapeHtml(ticket.stewardName)}</div>` : ''}
    ${ticket.voidReason ? `<div>Reason: ${escapeHtml(ticket.voidReason)}</div>` : ''}
    <div>Time: ${escapeHtml(ticket.firedAt)}</div>
  </div>
  <hr/>
  ${lines}
  <hr/>
  <div style="text-align:center;font-size:14px;font-weight:900">${footer}</div>
</body></html>`;
}
