import type { MasterUom } from '../hooks/useMasterUoms';

/** Canonical display label — prefer symbol, fall back to name. */
export function displayMasterUomName(uom: Pick<MasterUom, 'name' | 'symbol'>): string {
  return (uom.symbol?.trim() || uom.name).trim();
}

/** Default master UoM for new custom lines (Each → Piece → first). */
export function pickDefaultMasterUom(uoms: MasterUom[]): MasterUom | undefined {
  if (uoms.length === 0) return undefined;
  return (
    uoms.find((u) => u.name.toLowerCase() === 'each') ||
    uoms.find((u) => u.name.toLowerCase() === 'piece') ||
    uoms[0]
  );
}

/**
 * Resolve uomId + canonical uomName from master list.
 * Prevents duplicate free-text UoMs (Box vs box vs BOX).
 */
export function resolveQuotationUomFromMaster(
  uoms: MasterUom[],
  input: { uomId?: string | null; uomName?: string | null }
): { uomId: string | null; uomName: string | null; matched: boolean } {
  if (input.uomId) {
    const byId = uoms.find((u) => u.id === input.uomId);
    if (byId) {
      return { uomId: byId.id, uomName: displayMasterUomName(byId), matched: true };
    }
  }

  const raw = input.uomName?.trim();
  if (raw) {
    const lower = raw.toLowerCase();
    const byLabel = uoms.find(
      (u) =>
        u.name.toLowerCase() === lower ||
        (u.symbol?.trim().toLowerCase() ?? '') === lower
    );
    if (byLabel) {
      return { uomId: byLabel.id, uomName: displayMasterUomName(byLabel), matched: true };
    }
  }

  return {
    uomId: input.uomId ?? null,
    uomName: raw ?? null,
    matched: false,
  };
}
