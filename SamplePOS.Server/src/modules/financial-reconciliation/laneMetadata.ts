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
  wht: 'Withholding Tax',
  vat: 'VAT (Tax Payable)',
};

const LANE_TITLES: Record<LaneKind, string> = {
  integrity: 'Accounting Integrity',
  cache: 'Stored Balances',
  history: 'Posted Journal Audit',
  quarantine: 'Quarantine Exposure',
  writeoff: 'Write-off / Aging Exposure',
};

const LANE_SUBTITLES: Record<LaneKind, string> = {
  integrity: 'Period close — general ledger vs outstanding balances',
  cache: 'Stored values may need refresh — does not block period close',
  history: 'Informational — total posted vs active balance (includes reversals)',
  quarantine:
    'Informational — quarantine stock still on inventory GL until disposal (not a shrink)',
  writeoff:
    'Informational — overdue open AR vs YTD bad debt write-offs (does not block period close)',
};

/** Operator-facing guidance only — never expose API paths or internal endpoints. */
const MAINTENANCE_ACTIONS: Partial<Record<FinancialDomain, string>> = {
  ap: 'Refresh stored supplier balances from outstanding invoices',
  ar: 'Refresh stored customer balances from outstanding invoices',
  inventory: 'Refresh stored product values from inventory lots',
};

function integrityMatched(status: LaneStatus, difference: number): boolean {
  return status === 'RECONCILED' || Math.abs(difference) <= 0.01;
}

function cacheHealthy(status: LaneStatus, difference: number): boolean {
  return status === 'HEALTHY' || Math.abs(difference) <= 0.01;
}

export function resolvePeriodCloseBlocking(lane: LaneKind, domain?: FinancialDomain): boolean {
  // ADR-005 Decision B: VAT document↔GL recon is informational until purchase bills post input VAT
  if (domain === 'vat') return false;
  return lane === 'integrity';
}

export function resolveSeverity(lane: LaneKind, status: LaneStatus, difference: number): LaneSeverity {
  if (lane === 'history' || lane === 'quarantine' || lane === 'writeoff') return 'informational';
  if (status === 'INFORMATIONAL') return 'informational';
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
  if (domain === 'vat' && lane === 'integrity' && Math.abs(difference) > 0.01) {
    return 'Review VAT document boxes vs GL 2300 before remittance — purchase input may be inventory-embedded (Decision B)';
  }
  if (lane === 'integrity' && !integrityMatched(status, difference)) {
    return 'Review source documents and post missing journal entries — do not refresh stored balances until resolved';
  }
  if (lane === 'cache' && !cacheHealthy(status, difference)) {
    return MAINTENANCE_ACTIONS[domain] ?? 'Refresh stored balances from source documents';
  }
  if (lane === 'quarantine' && Math.abs(difference) > 0.01) {
    return 'Review quarantine aging and dispose lots when ready to recognize loss expense';
  }
  if (lane === 'writeoff' && Math.abs(difference) > 0.01) {
    return 'Review overdue AR and post Bad Debt Write-offs where collection is exhausted — do not use credit notes';
  }
  return null;
}

export function resolveStatusLabel(lane: LaneKind, status: LaneStatus): string {
  if (lane === 'history' || lane === 'quarantine' || lane === 'writeoff') return 'Informational';
  if (status === 'INFORMATIONAL') return 'Informational';
  if (lane === 'integrity') return status === 'RECONCILED' ? 'Reconciled' : 'Needs review';
  if (lane === 'cache') return status === 'HEALTHY' ? 'Up to date' : 'Needs refresh';
  return status;
}

export function buildFinancialLaneResult(
  domain: FinancialDomain,
  lane: LaneKind,
  asOfDate: string,
  computation: LaneComputation,
): FinancialLaneResult {
  const periodCloseBlocking = resolvePeriodCloseBlocking(lane, domain);
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
    subtitle:
      domain === 'vat'
        ? 'Informational — document VAT return vs GL 2300 (Decision B; does not block period close)'
        : LANE_SUBTITLES[lane],
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
