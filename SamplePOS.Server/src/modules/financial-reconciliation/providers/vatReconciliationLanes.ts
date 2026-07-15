/**
 * VAT financial lane calculations (ADR-005 Phase 3B)
 */
import type { Pool, PoolClient } from 'pg';
import { getVatAccrualReconProbe } from '../../vat-remittance/vatAccrualReconService.js';

type Db = Pool | PoolClient;

export async function getVatIntegrityLane(conn: Db, asOfDate?: string) {
  const probe = await getVatAccrualReconProbe(conn, asOfDate);
  return {
    documentNetVatPayable: probe.documentNetVatPayable,
    glTaxPayable2300: probe.glTaxPayable2300,
    integrityDifference: probe.difference,
    materialityThreshold: probe.materialityThreshold,
    status: probe.status,
    periodCloseBlocking: false as const,
    details: {
      decision: probe.decision,
      note: probe.note,
      periodStart: probe.periodStart,
      periodEnd: probe.periodEnd,
      ...probe.details,
    },
  };
}
