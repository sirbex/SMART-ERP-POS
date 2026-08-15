/**
 * Minimal ESC/POS test ticket — same delivery path as KOT (RAW Winspool).
 * Avoids SumatraPDF / pdf-to-printer which fails on many thermal POS printers.
 */
export function buildEscPosTestTicket(printerLabel: string): Buffer {
  const enc = new TextEncoder();
  const lines: Uint8Array[] = [];
  const push = (s: string | Uint8Array) => {
    lines.push(typeof s === 'string' ? enc.encode(s) : s);
  };
  // ESC @ init
  push(new Uint8Array([0x1b, 0x40]));
  // Center align
  push(new Uint8Array([0x1b, 0x61, 0x01]));
  // Double width/height on
  push(new Uint8Array([0x1d, 0x21, 0x11]));
  push('SMART PRINT\n');
  push(new Uint8Array([0x1d, 0x21, 0x00]));
  push('TEST PRINT\n');
  push('--------------------------------\n');
  // Left align
  push(new Uint8Array([0x1b, 0x61, 0x00]));
  const label = String(printerLabel || '(default)').slice(0, 40);
  push(`Printer: ${label}\n`);
  push(`Time: ${new Date().toLocaleString()}\n`);
  push('--------------------------------\n');
  push(new Uint8Array([0x1b, 0x61, 0x01]));
  push('OK\n\n\n');
  // Partial cut
  push(new Uint8Array([0x1d, 0x56, 0x01]));
  const total = lines.reduce((n, a) => n + a.length, 0);
  const out = Buffer.alloc(total);
  let o = 0;
  for (const part of lines) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}
