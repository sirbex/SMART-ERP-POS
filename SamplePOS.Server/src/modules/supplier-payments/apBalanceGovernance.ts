/**
 * AP balance governance — permanent service-layer enforcement (no DB triggers).
 *
 * After every journal that touches AP (2100) or supplier-tagged AP lines:
 *   1. Rebase affected account CurrentBalance from POSTED ledger (authoritative snap).
 *   2. Sync supplier master cache from open-item subledger when supplier entity on 2100.
 *
 * On tenant first touch after deploy: auto-heal cache drift if detected.
 */
import type { Pool, PoolClient } from 'pg';
import logger from '../../utils/logger.js';
import { syncSupplierBalanceFromOpenItems } from './apReconciliationEngine.js';
import {
  captureApReconciliationMetrics,
  verifyApCacheLayersOnly,
} from './apReconciliationMetrics.js';

export const AP_ACCOUNT_CODE = '2100';

export type JournalGovernanceLine = {
  accountCode: string;
  entityType?: string | null;
  entityId?: string | null;
};

/**
 * Rebase accounts.CurrentBalance from POSTED ledger for given account codes.
 * Idempotent; runs in caller transaction.
 */
export async function rebaseAccountCachesFromPostedLedger(
  client: PoolClient,
  accountCodes: string[] = [AP_ACCOUNT_CODE],
): Promise<number> {
  if (accountCodes.length === 0) return 0;

  const updateRes = await client.query<{ account_code: string }>(
    `
    WITH posted AS (
      SELECT le."AccountId",
        SUM(le."DebitAmount") - SUM(le."CreditAmount") AS net_debit,
        SUM(le."CreditAmount") - SUM(le."DebitAmount") AS net_credit
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      WHERE lt."Status" = 'POSTED'
      GROUP BY le."AccountId"
    ),
    targets AS (
      SELECT a."Id", a."AccountCode",
        CASE
          WHEN a."NormalBalance" = 'DEBIT' THEN COALESCE(p.net_debit, 0)
          ELSE COALESCE(p.net_credit, 0)
        END AS new_balance
      FROM accounts a
      LEFT JOIN posted p ON p."AccountId" = a."Id"
      WHERE a."AccountCode" = ANY($1::text[])
    )
    UPDATE accounts a
    SET "CurrentBalance" = t.new_balance,
        "UpdatedAt" = NOW()
    FROM targets t
    WHERE a."Id" = t."Id"
      AND ABS(a."CurrentBalance" - t.new_balance) > 0.01
    RETURNING a."AccountCode" AS account_code
    `,
    [accountCodes],
  );

  return updateRes.rowCount ?? 0;
}

/**
 * Wave 5 supplier cache sync — invoice repair + suppliers.OutstandingBalance.
 */
export async function syncSupplierApCache(
  client: PoolClient,
  supplierId: string,
  changeSource = 'AP_BALANCE_GOVERNANCE',
): Promise<void> {
  await syncSupplierBalanceFromOpenItems(client, supplierId, changeSource);
}

/**
 * Run after AccountingCore journal create/reverse (same transaction).
 */
export async function afterJournalEntryGovernance(
  client: PoolClient,
  lines: JournalGovernanceLine[],
): Promise<void> {
  const accountCodes = [...new Set(lines.map((l) => l.accountCode).filter(Boolean))];
  if (accountCodes.length > 0) {
    const updated = await rebaseAccountCachesFromPostedLedger(client, accountCodes);
    if (updated > 0) {
      logger.info('AP governance: rebased account cache from posted ledger', {
        accountCodes,
        accountsUpdated: updated,
      });
    }
  }

  const supplierIds = new Set<string>();
  for (const line of lines) {
    if (
      line.accountCode === AP_ACCOUNT_CODE &&
      line.entityType &&
      line.entityId &&
      line.entityType.toLowerCase() === 'supplier'
    ) {
      supplierIds.add(line.entityId);
    }
  }

  for (const supplierId of supplierIds) {
    await syncSupplierApCache(client, supplierId, 'AP_GOVERNANCE_AFTER_JOURNAL');
  }
}

export interface EnsureTenantApCachesResult {
  healed: boolean;
  suppliersUpdated: number;
  accountsRebased: number;
  entityTagsBackfilled: number;
  beforeDrift: { storedBalanceDrift: number; supplierCacheDrift: number };
  afterCacheOk: boolean;
}

const tenantApCacheAligned = new Set<string>();

/**
 * Backfill EntityType/EntityId on 2100 lines from posted supplier documents.
 * Fixes historical JEs posted before entity tagging was enforced.
 */
export async function backfillSupplierEntityTagsOnAp2100(
  client: PoolClient,
): Promise<number> {
  let total = 0;

  const invoiceRes = await client.query(
    `
    UPDATE ledger_entries le
    SET "EntityType" = 'supplier',
        "EntityId" = si."SupplierId"
    FROM ledger_transactions lt
    JOIN accounts a ON a."Id" = le."AccountId"
    JOIN supplier_invoices si ON si."Id" = lt."ReferenceId"
    WHERE a."AccountCode" = $1
      AND lt."Status" = 'POSTED'
      AND lt."ReferenceType" = 'SUPPLIER_INVOICE'
      AND (le."EntityType" IS NULL OR le."EntityId" IS NULL)
    `,
    [AP_ACCOUNT_CODE],
  );
  total += invoiceRes.rowCount ?? 0;

  const paymentRes = await client.query(
    `
    UPDATE ledger_entries le
    SET "EntityType" = 'supplier',
        "EntityId" = sp."SupplierId"
    FROM ledger_transactions lt
    JOIN accounts a ON a."Id" = le."AccountId"
    JOIN supplier_payments sp ON sp."Id" = lt."ReferenceId"
    WHERE a."AccountCode" = $1
      AND lt."Status" = 'POSTED'
      AND lt."ReferenceType" = 'SUPPLIER_PAYMENT'
      AND (le."EntityType" IS NULL OR le."EntityId" IS NULL)
    `,
    [AP_ACCOUNT_CODE],
  );
  total += paymentRes.rowCount ?? 0;

  const noteRes = await client.query(
    `
    UPDATE ledger_entries le
    SET "EntityType" = 'supplier',
        "EntityId" = si."SupplierId"
    FROM ledger_transactions lt
    JOIN accounts a ON a."Id" = le."AccountId"
    JOIN supplier_invoices si ON si."Id" = lt."ReferenceId"
    WHERE a."AccountCode" = $1
      AND lt."Status" = 'POSTED'
      AND lt."ReferenceType" IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE')
      AND (le."EntityType" IS NULL OR le."EntityId" IS NULL)
    `,
    [AP_ACCOUNT_CODE],
  );
  total += noteRes.rowCount ?? 0;

  if (total > 0) {
    logger.info('AP governance: backfilled supplier entity tags on account 2100', { rows: total });
  }
  return total;
}

/** Full cache heal: rebase 2100, backfill entity tags, recalc all suppliers. */
export async function runFullApCacheGovernanceHeal(client: PoolClient): Promise<{
  accountsRebased: number;
  entityTagsBackfilled: number;
  suppliersUpdated: number;
}> {
  const accountsRebased = await rebaseAccountCachesFromPostedLedger(client, [AP_ACCOUNT_CODE]);
  const entityTagsBackfilled = await backfillSupplierEntityTagsOnAp2100(client);
  let suppliersUpdated = 0;
  const suppliers = await client.query<{ Id: string }>(`SELECT "Id" FROM suppliers`);
  for (const row of suppliers.rows) {
    const { oldBalance, newBalance } = await syncSupplierBalanceFromOpenItems(
      client,
      row.Id,
      'AP_GOVERNANCE_FULL_HEAL',
    );
    if (Math.abs(oldBalance - newBalance) > 0.01) suppliersUpdated++;
  }
  return { accountsRebased, entityTagsBackfilled, suppliersUpdated };
}

/** Heal STORED + SUPPLIER cache layers when drifted (no GL correction JEs). */
export async function healApCachesIfDrifted(pool: Pool): Promise<boolean> {
  const before = await captureApReconciliationMetrics(pool);
  if (verifyApCacheLayersOnly(before).ok) return false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await runFullApCacheGovernanceHeal(client);
    await client.query('COMMIT');
    logger.info('AP cache auto-heal completed', {
      storedDriftBefore: before.storedBalanceDrift,
      cacheDriftBefore: before.supplierCacheDrift,
    });
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Once per tenant per process: if AP cache layers drift, heal without GL correction JEs.
 */
export async function ensureTenantApCachesAligned(
  pool: Pool,
  tenantSlug: string,
  options?: { force?: boolean },
): Promise<EnsureTenantApCachesResult> {
  const before = await captureApReconciliationMetrics(pool);
  const cacheBefore = verifyApCacheLayersOnly(before);

  if (!options?.force && tenantApCacheAligned.has(tenantSlug) && cacheBefore.ok) {
    return {
      healed: false,
      suppliersUpdated: 0,
      accountsRebased: 0,
      entityTagsBackfilled: 0,
      beforeDrift: {
        storedBalanceDrift: before.storedBalanceDrift,
        supplierCacheDrift: before.supplierCacheDrift,
      },
      afterCacheOk: true,
    };
  }

  if (cacheBefore.ok && !options?.force) {
    tenantApCacheAligned.add(tenantSlug);
    return {
      healed: false,
      suppliersUpdated: 0,
      accountsRebased: 0,
      entityTagsBackfilled: 0,
      beforeDrift: {
        storedBalanceDrift: before.storedBalanceDrift,
        supplierCacheDrift: before.supplierCacheDrift,
      },
      afterCacheOk: true,
    };
  }

  const client = await pool.connect();
  let healResult = { accountsRebased: 0, entityTagsBackfilled: 0, suppliersUpdated: 0 };
  try {
    await client.query('BEGIN');
    healResult = await runFullApCacheGovernanceHeal(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const after = await captureApReconciliationMetrics(pool);
  const cacheAfter = verifyApCacheLayersOnly(after);

  if (cacheAfter.ok) {
    tenantApCacheAligned.add(tenantSlug);
    logger.info('Tenant AP caches aligned (service-layer governance)', {
      tenantSlug,
      ...healResult,
      beforeStoredDrift: before.storedBalanceDrift,
      beforeCacheDrift: before.supplierCacheDrift,
    });
  } else {
    tenantApCacheAligned.delete(tenantSlug);
    logger.error('Tenant AP cache heal incomplete — will retry on next request', {
      tenantSlug,
      failures: cacheAfter.failures,
      ...healResult,
    });
  }

  return {
    healed: true,
    suppliersUpdated: healResult.suppliersUpdated,
    accountsRebased: healResult.accountsRebased,
    entityTagsBackfilled: healResult.entityTagsBackfilled,
    beforeDrift: {
      storedBalanceDrift: before.storedBalanceDrift,
      supplierCacheDrift: before.supplierCacheDrift,
    },
    afterCacheOk: cacheAfter.ok,
  };
}

/** Test-only */
export function clearTenantApGovernanceCache(): void {
  tenantApCacheAligned.clear();
}
