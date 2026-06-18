import type pg from 'pg';

export type MasterUomRow = { id: string; name: string; symbol: string | null };

export function displayUomName(uom: Pick<MasterUomRow, 'name' | 'symbol'>): string {
  return (uom.symbol?.trim() || uom.name).trim();
}

export function resolveUomFromMasterList(
  uoms: MasterUomRow[],
  input: { uomId?: string | null; uomName?: string | null }
): { uomId: string | null; uomName: string | null; matched: boolean } {
  if (input.uomId) {
    const byId = uoms.find((u) => u.id === input.uomId);
    if (byId) {
      return { uomId: byId.id, uomName: displayUomName(byId), matched: true };
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
      return { uomId: byLabel.id, uomName: displayUomName(byLabel), matched: true };
    }
  }

  return {
    uomId: input.uomId ?? null,
    uomName: raw ?? null,
    matched: false,
  };
}

export async function loadMasterUoms(client: pg.PoolClient): Promise<MasterUomRow[]> {
  const { rows } = await client.query<{ id: string; name: string; symbol: string | null }>(
    `SELECT id, name, symbol FROM uoms ORDER BY name`
  );
  return rows;
}

export interface QuotationUomLineInput {
  itemType?: string;
  productId?: string | null;
  uomId?: string | null;
  uomName?: string | null;
}

/**
 * Normalize quotation line UoM to canonical master id + label.
 * Custom lines must resolve to a master UoM (no orphan free-text).
 */
export function normalizeQuotationLineUom(
  masterUoms: MasterUomRow[],
  item: QuotationUomLineInput
): { uomId: string | null; uomName: string | null } {
  const isCustom = item.itemType === 'custom' || (!item.productId && item.itemType !== 'product');

  const resolved = resolveUomFromMasterList(masterUoms, {
    uomId: item.uomId,
    uomName: item.uomName,
  });

  if (isCustom && (item.uomId || item.uomName?.trim()) && !resolved.matched) {
    throw new Error(
      `Invalid UoM "${item.uomName || item.uomId}". Select a unit from the system UoM list.`
    );
  }

  if (resolved.matched) {
    return { uomId: resolved.uomId, uomName: resolved.uomName };
  }

  return { uomId: item.uomId ?? null, uomName: item.uomName?.trim() ?? null };
}
