import type { Pool, PoolClient } from 'pg';
import { getBusinessDate } from '../../utils/dateRange.js';
import { buildFinancialLaneResult, getDomainTitle } from './laneMetadata.js';
import { getFinancialLaneProvider, listRegisteredDomains } from './financialLaneRegistry.js';
import type {
  DomainLaneSummary,
  FinancialDomain,
  FinancialLaneResult,
  LaneKind,
} from './types.js';

type Db = Pool | PoolClient;

const VALID_DOMAINS = new Set<string>(['ap', 'ar', 'inventory', 'cash', 'wht', 'vat']);
const VALID_LANES = new Set<string>(['integrity', 'cache', 'history', 'quarantine', 'writeoff']);

export function parseFinancialDomain(value: string): FinancialDomain {
  const normalized = value.toLowerCase();
  if (!VALID_DOMAINS.has(normalized)) {
    throw new Error(`Unknown financial domain: ${value}`);
  }
  return normalized as FinancialDomain;
}

export function parseLaneKind(value: string): LaneKind {
  const normalized = value.toLowerCase();
  if (!VALID_LANES.has(normalized)) {
    throw new Error(`Unknown lane kind: ${value}`);
  }
  return normalized as LaneKind;
}

export async function getFinancialLane(
  pool: Db,
  domain: FinancialDomain,
  lane: LaneKind,
  asOfDate?: string,
): Promise<FinancialLaneResult> {
  const provider = getFinancialLaneProvider(domain);
  if (!provider.supportedLanes.includes(lane)) {
    throw new Error(`Domain ${domain} does not support lane: ${lane}`);
  }

  const date = asOfDate ?? getBusinessDate();
  const ctx = { pool, asOfDate: date };

  let computation;
  if (lane === 'integrity') {
    computation = await provider.computeIntegrity(ctx);
  } else if (lane === 'cache') {
    if (!provider.computeCache) {
      throw new Error(`Domain ${domain} does not implement cache lane`);
    }
    computation = await provider.computeCache(ctx);
  } else if (lane === 'quarantine') {
    if (!provider.computeQuarantine) {
      throw new Error(`Domain ${domain} does not implement quarantine lane`);
    }
    computation = await provider.computeQuarantine(ctx);
  } else if (lane === 'writeoff') {
    if (!provider.computeWriteoff) {
      throw new Error(`Domain ${domain} does not implement writeoff lane`);
    }
    computation = await provider.computeWriteoff(ctx);
  } else {
    computation = await provider.computeAudit(ctx);
  }

  return buildFinancialLaneResult(domain, lane, date, computation);
}

export async function getDomainLaneSummary(
  pool: Db,
  domain: FinancialDomain,
  asOfDate?: string,
  options?: { lanes?: LaneKind[] },
): Promise<DomainLaneSummary> {
  const provider = getFinancialLaneProvider(domain);
  const requested = options?.lanes?.length
    ? provider.supportedLanes.filter((lane) => options.lanes!.includes(lane))
    : [...provider.supportedLanes];
  const lanes = await Promise.all(
    requested.map((lane) => getFinancialLane(pool, domain, lane, asOfDate)),
  );

  const integrity = lanes.find((l) => l.lane === 'integrity');
  const periodCloseBlocked =
    integrity != null
    && integrity.periodCloseBlocking
    && integrity.status !== 'RECONCILED'
    && Math.abs(integrity.difference) > 0.01;

  return {
    domain,
    domainTitle: getDomainTitle(domain),
    lanes,
    periodCloseBlocked,
  };
}

/** Lanes required for Control Tower / period-close — skip history journal dumps. */
export const FINANCIAL_HEALTH_LANES: LaneKind[] = [
  'integrity',
  'cache',
  'quarantine',
  'writeoff',
];

const HEALTH_EXCEPTION_CAP = 25;
const HEALTH_CACHE_TTL_MS = 45_000;

type HealthCacheEntry = { expiresAt: number; data: DomainLaneSummary[] };
const healthCacheByPool = new WeakMap<object, Map<string, HealthCacheEntry>>();

function trimHealthSummary(summary: DomainLaneSummary): DomainLaneSummary {
  return {
    ...summary,
    lanes: summary.lanes.map((lane) => ({
      ...lane,
      exceptions: lane.exceptions.slice(0, HEALTH_EXCEPTION_CAP),
      auditJournals: [],
    })),
  };
}

export async function getAllDomainSummaries(
  pool: Db,
  asOfDate?: string,
  options?: {
    lanes?: LaneKind[];
    exceptionCap?: number;
    omitAuditJournals?: boolean;
  },
): Promise<DomainLaneSummary[]> {
  const domains = listRegisteredDomains();
  const summaries = await Promise.all(
    domains.map((d) =>
      getDomainLaneSummary(pool, d, asOfDate, {
        lanes: options?.lanes,
      }),
    ),
  );

  if (options?.exceptionCap == null && !options?.omitAuditJournals) {
    return summaries;
  }

  return summaries.map((summary) => ({
    ...summary,
    lanes: summary.lanes.map((lane) => ({
      ...lane,
      exceptions:
        options.exceptionCap != null
          ? lane.exceptions.slice(0, options.exceptionCap)
          : lane.exceptions,
      auditJournals: options.omitAuditJournals ? [] : lane.auditJournals,
    })),
  }));
}

/**
 * Control Tower health payload — integrity/cache (+ quarantine/writeoff when present).
 * Skips history lane (100-journal dumps) and caches briefly per pool/asOf.
 */
export async function getFinancialHealthSummaries(
  pool: Db,
  asOfDate?: string,
): Promise<DomainLaneSummary[]> {
  const date = asOfDate ?? getBusinessDate();
  const cacheKey = date;
  const poolKey = pool as object;
  let byDate = healthCacheByPool.get(poolKey);
  if (!byDate) {
    byDate = new Map();
    healthCacheByPool.set(poolKey, byDate);
  }
  const hit = byDate.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.data;
  }

  const summaries = await getAllDomainSummaries(pool, date, {
    lanes: FINANCIAL_HEALTH_LANES,
    exceptionCap: HEALTH_EXCEPTION_CAP,
    omitAuditJournals: true,
  });
  const trimmed = summaries.map(trimHealthSummary);
  byDate.set(cacheKey, { expiresAt: Date.now() + HEALTH_CACHE_TTL_MS, data: trimmed });
  return trimmed;
}

/** Merge legacy AP field names for consumers not yet on FinancialLaneResult. */
export function withLegacyApFields(result: FinancialLaneResult): FinancialLaneResult & Record<string, unknown> {
  const base = { ...result, generatedAt: result.lastCalculated };
  if (result.lane === 'integrity') {
    return {
      ...base,
      glNetActive: result.leftAmount,
      openItemSubledger: result.rightAmount,
      integrityDifference: result.difference,
    };
  }
  if (result.lane === 'cache') {
    return {
      ...base,
      openItemBalance: result.leftAmount,
      supplierCacheBalance: result.rightAmount,
      cacheDifference: result.difference,
    };
  }
  return {
    ...base,
    grossPosted: result.leftAmount,
    netActive: result.rightAmount,
    reversalImpact: result.difference,
    supplierExceptions: result.exceptions.map((e) => ({
      supplierId: e.entityId,
      supplierName: e.entityName,
      leftAmount: e.leftAmount,
      rightAmount: e.rightAmount,
      difference: e.difference,
    })),
    journals: result.auditJournals.map((j) => ({
      transactionId: j.transactionId,
      transactionNumber: j.transactionNumber,
      referenceType: j.referenceType,
      referenceNumber: j.referenceNumber,
      transactionDate: j.transactionDate,
      isReversed: j.isReversed,
      isReversingEntry: j.isReversingEntry,
      apImpact: j.impact,
      supplierName: j.entityName,
    })),
  };
}

/** Merge legacy AR field names for consumers not yet on FinancialLaneResult. */
export function withLegacyArFields(result: FinancialLaneResult): FinancialLaneResult & Record<string, unknown> {
  const base = { ...result, generatedAt: result.lastCalculated };
  if (result.lane === 'integrity') {
    return {
      ...base,
      glNetActive: result.leftAmount,
      openItemSubledger: result.rightAmount,
      integrityDifference: result.difference,
    };
  }
  if (result.lane === 'cache') {
    return {
      ...base,
      openItemBalance: result.leftAmount,
      customerCacheBalance: result.rightAmount,
      cacheDifference: result.difference,
    };
  }
  if (result.lane === 'writeoff') {
    return {
      ...base,
      overdueOpen: result.leftAmount,
      writeoffYtd: result.rightAmount,
      exposureDifference: result.difference,
      overdueLines: result.details?.overdueLines,
      writeoffDocs: result.details?.writeoffDocs,
      minAgeDays: result.details?.minAgeDays,
    };
  }
  return {
    ...base,
    grossPosted: result.leftAmount,
    netActive: result.rightAmount,
    reversalImpact: result.difference,
    customerExceptions: result.exceptions.map((e) => ({
      customerId: e.entityId,
      customerName: e.entityName,
      leftAmount: e.leftAmount,
      rightAmount: e.rightAmount,
      difference: e.difference,
    })),
    journals: result.auditJournals.map((j) => ({
      transactionId: j.transactionId,
      transactionNumber: j.transactionNumber,
      referenceType: j.referenceType,
      referenceNumber: j.referenceNumber,
      transactionDate: j.transactionDate,
      isReversed: j.isReversed,
      isReversingEntry: j.isReversingEntry,
      arImpact: j.impact,
      customerName: j.entityName,
    })),
  };
}

/** Merge legacy Inventory field names for consumers not yet on FinancialLaneResult. */
export function withLegacyInventoryFields(
  result: FinancialLaneResult,
): FinancialLaneResult & Record<string, unknown> {
  const base = { ...result, generatedAt: result.lastCalculated };
  if (result.lane === 'integrity') {
    return {
      ...base,
      glNetActive: result.leftAmount,
      batchSubledger: result.rightAmount,
      integrityDifference: result.difference,
      materialityThreshold: result.details?.materialityThreshold,
    };
  }
  if (result.lane === 'cache') {
    return {
      ...base,
      batchSubledger: result.leftAmount,
      productCacheBalance: result.rightAmount,
      cacheDifference: result.difference,
      storedBalance1300: result.details?.storedBalance1300,
      storedBalanceDrift: result.details?.storedBalanceDrift,
    };
  }
  if (result.lane === 'quarantine') {
    return {
      ...base,
      quarantineExposure: result.leftAmount,
      totalLines: result.details?.totalLines,
      totalQuantity: result.details?.totalQuantity,
      byStoreType: result.details?.byStoreType,
    };
  }
  return {
    ...base,
    grossPosted: result.leftAmount,
    netActive: result.rightAmount,
    reversalImpact: result.difference,
    journals: result.auditJournals.map((j) => ({
      transactionId: j.transactionId,
      transactionNumber: j.transactionNumber,
      referenceType: j.referenceType,
      referenceNumber: j.referenceNumber,
      transactionDate: j.transactionDate,
      isReversed: j.isReversed,
      isReversingEntry: j.isReversingEntry,
      inventoryImpact: j.impact,
    })),
  };
}
