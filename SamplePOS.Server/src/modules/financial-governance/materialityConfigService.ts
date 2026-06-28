import type { Pool, PoolClient } from 'pg';
import { arMaterialityThreshold } from '../customer-payments/arReconciliationEngine.js';
import { inventoryMaterialityThreshold } from '../inventory/inventoryReconciliationEngine.js';
import type { FinancialDomain } from '../financial-reconciliation/types.js';
import type { MaterialityConfigRow, MaterialityMode } from './types.js';

type Db = Pool | PoolClient;

const GOVERNED_DOMAINS: FinancialDomain[] = ['ap', 'ar', 'inventory'];

function mapRow(row: Record<string, unknown>): MaterialityConfigRow {
  return {
    id: String(row.id),
    domain: row.domain as FinancialDomain,
    mode: row.mode as MaterialityMode,
    exactTolerance: row.exact_tolerance != null ? Number(row.exact_tolerance) : null,
    percentRate: row.percent_rate != null ? Number(row.percent_rate) : null,
    floorAmount: row.floor_amount != null ? Number(row.floor_amount) : null,
    capAmount: row.cap_amount != null ? Number(row.cap_amount) : null,
    notes: row.notes != null ? String(row.notes) : null,
    updatedBy: row.updated_by != null ? String(row.updated_by) : null,
    updatedAt: String(row.updated_at),
  };
}

/** Framework defaults — matches lane engines until tenant overrides apply. */
export function defaultMaterialityThreshold(domain: FinancialDomain, glBalance: number): number {
  switch (domain) {
    case 'ap':
      return 0.01;
    case 'ar':
      return arMaterialityThreshold(glBalance);
    case 'inventory':
      return inventoryMaterialityThreshold(glBalance);
    default:
      return 0.01;
  }
}

export async function listMaterialityConfig(conn: Db): Promise<MaterialityConfigRow[]> {
  const res = await conn.query(`
    SELECT id, domain, mode, exact_tolerance, percent_rate, floor_amount, cap_amount,
           notes, updated_by, updated_at
    FROM financial_materiality_config
    WHERE domain = ANY($1::text[])
    ORDER BY domain
  `, [GOVERNED_DOMAINS]);

  return res.rows.map(mapRow);
}

export async function getMaterialityConfig(
  conn: Db,
  domain: FinancialDomain,
): Promise<MaterialityConfigRow | null> {
  const res = await conn.query(`
    SELECT id, domain, mode, exact_tolerance, percent_rate, floor_amount, cap_amount,
           notes, updated_by, updated_at
    FROM financial_materiality_config
    WHERE domain = $1
  `, [domain]);
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function resolveMaterialityThreshold(
  conn: Db,
  domain: FinancialDomain,
  glBalance: number,
): Promise<{ threshold: number; source: 'default' | 'configured'; mode: MaterialityMode }> {
  try {
    const config = await getMaterialityConfig(conn, domain);
    if (!config || config.mode === 'default') {
      return {
        threshold: defaultMaterialityThreshold(domain, glBalance),
        source: 'default',
        mode: 'default',
      };
    }

    const absGl = Math.abs(glBalance);

    if (config.mode === 'exact') {
      return {
        threshold: config.exactTolerance ?? 0.01,
        source: 'configured',
        mode: config.mode,
      };
    }

    const rate = config.percentRate ?? 0.0001;
    const floor = config.floorAmount ?? 0;
    let threshold = Math.max(absGl * rate, floor);

    if (config.mode === 'percent_floor_cap' && config.capAmount != null) {
      threshold = Math.min(threshold, config.capAmount);
    }

    return { threshold, source: 'configured', mode: config.mode };
  } catch {
    return {
      threshold: defaultMaterialityThreshold(domain, glBalance),
      source: 'default',
      mode: 'default',
    };
  }
}

export interface UpdateMaterialityInput {
  mode: MaterialityMode;
  exactTolerance?: number | null;
  percentRate?: number | null;
  floorAmount?: number | null;
  capAmount?: number | null;
  notes?: string | null;
  updatedBy: string;
}

export async function upsertMaterialityConfig(
  conn: Db,
  domain: FinancialDomain,
  input: UpdateMaterialityInput,
): Promise<MaterialityConfigRow> {
  const res = await conn.query(`
    INSERT INTO financial_materiality_config (
      domain, mode, exact_tolerance, percent_rate, floor_amount, cap_amount, notes, updated_by, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (domain) DO UPDATE SET
      mode = EXCLUDED.mode,
      exact_tolerance = EXCLUDED.exact_tolerance,
      percent_rate = EXCLUDED.percent_rate,
      floor_amount = EXCLUDED.floor_amount,
      cap_amount = EXCLUDED.cap_amount,
      notes = EXCLUDED.notes,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING id, domain, mode, exact_tolerance, percent_rate, floor_amount, cap_amount,
              notes, updated_by, updated_at
  `, [
    domain,
    input.mode,
    input.exactTolerance ?? null,
    input.percentRate ?? null,
    input.floorAmount ?? null,
    input.capAmount ?? null,
    input.notes ?? null,
    input.updatedBy,
  ]);

  return mapRow(res.rows[0]);
}
