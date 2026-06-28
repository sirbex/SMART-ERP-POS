import type {
  FinancialDomain,
  LaneKind,
  LaneSeverity,
  LaneStatus,
  FinancialLaneResult,
  LaneComputation,
} from './types.js';

const DOMAIN_TITLES: Record<FinancialDomain, string> = {
  ap: 'Accounts Payable',
  ar: 'Accounts Receivable',
  inventory: 'Inventory',
  cash: 'Cash',
};

const LANE_TITLES: Record<LaneKind, string> = {
  integrity: 'Accounting Integrity',
  cache: 'Cache Health',
  history: 'Posted Journal Audit',
};

const LANE_SUBTITLES: Record<LaneKind, string> = {
  integrity: 'Period close — net-active GL vs open-item subledger',
  cache: 'Maintenance — open-item vs denormalized cache (does not gate period close)',
  history: 'Informational — gross posted vs net-active (reversals and history)',
};

const MAINTENANCE_ACTIONS: Partial<Record<FinancialDomain, string>> = {
  ap: 'POST /api/system/gl/recalc-supplier-balances',
  ar: 'POST /api/system/gl/recalc-customer-balances',
  inventory: 'POST /api/system/gl/rebuild-inventory-balances; rebase 1300 via rebase-account-balances',
};

function integrityMatched(status: LaneStatus, difference: number): boolean {
  return status === 'RECONCILED' || Math.abs(difference) <= 0.01;
}

function cacheHealthy(status: LaneStatus, difference: number): boolean {
  return status === 'HEALTHY' || Math.abs(difference) <= 0.01;
}

export function resolvePeriodCloseBlocking(lane: LaneKind): boolean {
  return lane === 'integrity';
}

export function resolveSeverity(lane: LaneKind, status: LaneStatus, difference: number): LaneSeverity {
  if (lane === 'history') return 'informational';
  if (lane === 'cache') {
    return cacheHealthy(status, difference) ? 'informational' : 'maintenance';
  }
  return integrityMatched(status, difference) ? 'informational' : 'critical';
}

export function resolveRecommendedAction(
  domain: FinancialDomain,
  lane: LaneKind,
  status: LaneStatus,
  difference: number,
): string | null {
  if (lane === 'integrity' && !integrityMatched(status, difference)) {
    return 'Investigate open-item vs GL gaps per entity; do not use cache heal for integrity fixes';
  }
  if (lane === 'cache' && !cacheHealthy(status, difference)) {
    return MAINTENANCE_ACTIONS[domain] ?? 'Run domain cache recalculation maintenance endpoint';
  }
  return null;
}

export function resolveStatusLabel(lane: LaneKind, status: LaneStatus): string {
  if (lane === 'history') return 'Informational';
  if (lane === 'integrity') return status === 'RECONCILED' ? 'Reconciled' : 'Investigate';
  if (lane === 'cache') return status === 'HEALTHY' ? 'Healthy' : 'Cache drift';
  return status;
}

export function buildFinancialLaneResult(
  domain: FinancialDomain,
  lane: LaneKind,
  asOfDate: string,
  computation: LaneComputation,
): FinancialLaneResult {
  const periodCloseBlocking = resolvePeriodCloseBlocking(lane);
  const severity = resolveSeverity(lane, computation.status, computation.difference);
  const recommendedAction = resolveRecommendedAction(
    domain,
    lane,
    computation.status,
    computation.difference,
  );
  const now = new Date().toISOString();

  return {
    domain,
    lane,
    title: `${DOMAIN_TITLES[domain]} ${LANE_TITLES[lane]}`,
    subtitle: LANE_SUBTITLES[lane],
    status: computation.status,
    leftLabel: computation.leftLabel,
    leftAmount: computation.leftAmount,
    rightLabel: computation.rightLabel,
    rightAmount: computation.rightAmount,
    difference: computation.difference,
    periodCloseBlocking,
    gatesPeriodClose: periodCloseBlocking,
    severity,
    recommendedAction,
    asOfDate,
    lastCalculated: now,
    exceptions: computation.exceptions ?? [],
    auditJournals: computation.auditJournals ?? [],
    details: computation.details ?? {},
  };
}

export function getDomainTitle(domain: FinancialDomain): string {
  return DOMAIN_TITLES[domain];
}
