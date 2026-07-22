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
): Promise<DomainLaneSummary> {
  const provider = getFinancialLaneProvider(domain);
  const lanes = await Promise.all(
    provider.supportedLanes.map((lane) => getFinancialLane(pool, domain, lane, asOfDate)),
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

export async function getAllDomainSummaries(
  pool: Db,
  asOfDate?: string,
): Promise<DomainLaneSummary[]> {
  const domains = listRegisteredDomains();
  return Promise.all(domains.map((d) => getDomainLaneSummary(pool, d, asOfDate)));
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
