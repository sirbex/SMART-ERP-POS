import { poLineBaseQuantity } from '../../../shared/utils/po-line-uom';

/** Base inventory qty → display qty in selected order UoM. */
export function displayQtyFromBase(baseQty: number, conversionFactor: number | string): string {
  const f = Number(conversionFactor) || 1;
  if (f <= 0) return String(baseQty);
  const display = baseQty / f;
  const rounded = Math.round(display * 1e6) / 1e6;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(6).replace(/\.?0+$/, '');
}

/** Display qty in order UoM → base qty for API / inventory engine. */
export function baseQtyFromDisplay(
  displayQty: number | string,
  conversionFactor: number | string,
): number {
  return poLineBaseQuantity(displayQty, conversionFactor);
}

export function combineApprovalLineComment(
  reason: string,
  warehouseNotes: string,
): string | null {
  const r = reason.trim();
  const n = warehouseNotes.trim();
  if (!r && !n) return null;
  if (r && n) return `${r} — ${n}`;
  return r || n;
}

export function splitApprovalLineComment(comment: string | null | undefined): {
  reason: string;
  warehouseNotes: string;
} {
  if (!comment?.trim()) return { reason: '', warehouseNotes: '' };
  const parts = comment.split(' — ');
  if (parts.length >= 2) {
    return { reason: parts[0].trim(), warehouseNotes: parts.slice(1).join(' — ').trim() };
  }
  return { reason: comment.trim(), warehouseNotes: '' };
}
