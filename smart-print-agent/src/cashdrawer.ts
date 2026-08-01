/**
 * Pulse cash drawer via ESC/POS open-drawer on the receipt printer.
 * Many drawers are connected through the receipt printer's kick-out port.
 */
import { writeRawToPrinter } from './rawPrint.js';

export async function openCashDrawer(printerName?: string | null): Promise<void> {
  // ESC p m t1 t2 — standard drawer kick
  const kick = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  await writeRawToPrinter(kick, printerName, 'SMART-CashDrawer');
}
