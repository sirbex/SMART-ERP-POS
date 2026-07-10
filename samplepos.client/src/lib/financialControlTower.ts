import type { DomainLaneSummary, FinancialDomain } from '../types/financialLane';
import { cacheLane, domainBusinessName, integrityLane } from './financialBusinessLabels';
import type { ExceptionInboxItem } from './financialWorkspace';
import {
    checklistProgress,
    type CloseChecklistStep,
} from './financialCloseChecklist';
import {
    domainReconciliationPath,
    exceptionWorkspacePath,
    ledgerReviewPath,
    type ReconWorkspaceKey,
} from './financialWorkspaceRoutes';

export type TowerHealthTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface TowerDomainStatus {
    domain: FinancialDomain | 'cash';
    label: string;
    accountCode: string;
    tone: TowerHealthTone;
    difference: number;
    exceptionCount: number;
    blocksClose: boolean;
    workspacePath: string;
    workspaceReady: boolean;
}

export interface TowerAttentionItem {
    id: string;
    domain: ExceptionInboxItem['domain'];
    domainLabel: string;
    title: string;
    amount: number;
    blocksClose: boolean;
    workspacePath: string;
}

export interface TowerWorkspaceLauncher {
    id: ReconWorkspaceKey | 'tower';
    title: string;
    description: string;
    accountCode: string;
    path: string;
    tone: TowerHealthTone;
    exceptionCount: number;
    blocksClose: boolean;
    operational: boolean;
}

const WORKSPACE_META: Record<
    ReconWorkspaceKey,
    { title: string; description: string; accountCode: string; domain: FinancialDomain | 'cash' }
> = {
    suppliers: {
        title: 'Supplier Reconciliation',
        description: 'Match AP (2100) to open supplier bills — search, trace, resolve.',
        accountCode: '2100',
        domain: 'ap',
    },
    customers: {
        title: 'Customer Reconciliation',
        description: 'Match AR (1200) to open customer invoices.',
        accountCode: '1200',
        domain: 'ar',
    },
    inventory: {
        title: 'Inventory Reconciliation',
        description: 'Match inventory (1300) to batch valuation.',
        accountCode: '1300',
        domain: 'inventory',
    },
    banking: {
        title: 'Bank Reconciliation',
        description: 'Match cash (1010) to bank activity.',
        accountCode: '1010',
        domain: 'cash',
    },
    ledger: {
        title: 'General Ledger Review',
        description: 'Review posted journals and trial balance.',
        accountCode: 'GL',
        domain: 'cash',
    },
};

function domainTone(
    summary: DomainLaneSummary | undefined,
    cashDifference: number | undefined,
    isCash: boolean,
): TowerHealthTone {
    if (isCash) {
        if (cashDifference !== undefined && Math.abs(cashDifference) > 0.01) return 'danger';
        return 'success';
    }
    if (!summary) return 'neutral';
    if (summary.periodCloseBlocked) return 'danger';
    const cache = cacheLane(summary);
    if (cache && cache.status !== 'HEALTHY' && Math.abs(cache.difference) > 0.01) return 'warning';
    return 'success';
}

export function buildTowerDomainStatuses(
    summaries: DomainLaneSummary[],
    inbox: ExceptionInboxItem[],
    asOfDate: string,
    cashDifference?: number,
): TowerDomainStatus[] {
    const domains: Array<{ domain: FinancialDomain | 'cash'; accountCode: string }> = [
        { domain: 'ap', accountCode: '2100' },
        { domain: 'ar', accountCode: '1200' },
        { domain: 'inventory', accountCode: '1300' },
        { domain: 'cash', accountCode: '1010' },
    ];

    return domains.map(({ domain, accountCode }) => {
        const isCash = domain === 'cash';
        const summary = isCash ? undefined : summaries.find((s) => s.domain === domain);
        const integrity = summary ? integrityLane(summary) : undefined;
        const domainItems = inbox.filter((i) => i.domain === domain);
        const diff = isCash ? (cashDifference ?? 0) : (integrity?.difference ?? 0);

        return {
            domain,
            label: isCash ? 'Cash' : domainBusinessName(domain),
            accountCode,
            tone: domainTone(summary, cashDifference, isCash),
            difference: diff,
            exceptionCount: domainItems.length,
            blocksClose: domainItems.some((i) => i.blocksClose) || (isCash && Math.abs(diff) > 0.01),
            workspacePath: domainReconciliationPath(isCash ? 'cash' : domain, asOfDate),
            workspaceReady: true,
        };
    });
}

export function buildTowerAttentionPreview(
    inbox: ExceptionInboxItem[],
    asOfDate: string,
    limit = 5,
): TowerAttentionItem[] {
    return inbox.slice(0, limit).map((item) => ({
        id: item.id,
        domain: item.domain,
        domainLabel: item.domainLabel,
        title: item.title,
        amount: item.amount,
        blocksClose: item.blocksClose,
        workspacePath: exceptionWorkspacePath(item.id, asOfDate),
    }));
}

export function buildTowerWorkspaceLaunchers(
    summaries: DomainLaneSummary[],
    inbox: ExceptionInboxItem[],
    asOfDate: string,
    cashDifference?: number,
): TowerWorkspaceLauncher[] {
    const keys = Object.keys(WORKSPACE_META) as ReconWorkspaceKey[];

    return keys.map((key) => {
        const meta = WORKSPACE_META[key];
        const isCash = meta.domain === 'cash' && key === 'banking';
        const summary = key === 'ledger' ? undefined : summaries.find((s) => s.domain === meta.domain);
        const domainItems =
            key === 'ledger'
                ? []
                : inbox.filter((i) => i.domain === (isCash ? 'cash' : meta.domain));

        const domainForPath: Record<ReconWorkspaceKey, FinancialDomain | null> = {
            suppliers: 'ap',
            customers: 'ar',
            inventory: 'inventory',
            banking: 'cash',
            ledger: null,
        };
        const path =
            key === 'ledger'
                ? ledgerReviewPath(asOfDate)
                : domainForPath[key]
                  ? domainReconciliationPath(domainForPath[key]!, asOfDate)
                  : '/accounting/general-ledger';

        return {
            id: key,
            title: meta.title,
            description: meta.description,
            accountCode: meta.accountCode,
            path,
            tone:
                key === 'ledger'
                    ? 'neutral'
                    : domainTone(summary, cashDifference, isCash),
            exceptionCount: domainItems.length,
            blocksClose: domainItems.some((i) => i.blocksClose),
            operational: true,
        };
    });
}

export interface TowerCloseSummary {
    completed: number;
    total: number;
    blockingRemaining: number;
    readyToClose: boolean;
    nextStep: CloseChecklistStep | null;
    blockedSteps: CloseChecklistStep[];
}

export function buildTowerCloseSummary(
    steps: CloseChecklistStep[],
    readyToClose: boolean,
): TowerCloseSummary {
    const progress = checklistProgress(steps);
    const blockedSteps = steps.filter((s) => s.status === 'blocked' && s.blocksClose);
    const nextStep =
        blockedSteps[0]
        ?? steps.find((s) => s.status === 'pending' && s.id !== 'step-close-period')
        ?? null;

    return {
        ...progress,
        readyToClose,
        nextStep,
        blockedSteps: blockedSteps.slice(0, 3),
    };
}
