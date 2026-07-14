import type { DomainLaneSummary } from '../types/financialLane';
import type { GovernanceDashboard } from '../types/financialGovernance';
import { cacheLane, integrityLane } from './financialBusinessLabels';
import { domainReconciliationPath, ledgerReviewPath, periodCloseWorkspacePath } from './financialWorkspaceRoutes';
import type { ExceptionInboxItem } from './financialWorkspace';

export type CloseStepStatus = 'complete' | 'blocked' | 'warning' | 'pending' | 'locked';

export interface CloseChecklistSubItem {
    id: string;
    label: string;
    amount: number;
    exceptionId: string;
    blocksClose: boolean;
}

export interface CloseChecklistStep {
    id: string;
    order: number;
    title: string;
    description: string;
    accountCode?: string;
    status: CloseStepStatus;
    blocksClose: boolean;
    difference: number | null;
    exceptionCount: number;
    estimatedMinutes: number;
    path: string;
    substeps: CloseChecklistSubItem[];
}

const DOMAIN_ORDER = ['ap', 'ar', 'inventory', 'cash', 'wht'] as const;

const DOMAIN_STEP_META: Record<
    (typeof DOMAIN_ORDER)[number],
    { title: string; description: string; accountCode: string; minutes: number }
> = {
    ap: {
        title: 'Reconcile supplier balances',
        description: 'Confirm Accounts Payable (2100) matches outstanding supplier bills.',
        accountCode: '2100',
        minutes: 15,
    },
    ar: {
        title: 'Reconcile customer balances',
        description: 'Confirm Accounts Receivable (1200) matches open customer invoices.',
        accountCode: '1200',
        minutes: 15,
    },
    inventory: {
        title: 'Reconcile inventory valuation',
        description: 'Confirm Inventory (1300) matches batch valuation and stored product values.',
        accountCode: '1300',
        minutes: 20,
    },
    cash: {
        title: 'Reconcile cash',
        description: 'Confirm Cash (1010) matches bank activity and recorded receipts.',
        accountCode: '1010',
        minutes: 15,
    },
    wht: {
        title: 'Reconcile withholding tax',
        description: 'Confirm WHT Payable (2350) and Tax Receivable (1250) match WHT entries.',
        accountCode: '2350',
        minutes: 10,
    },
};

function domainInboxItems(inbox: ExceptionInboxItem[], domain: string): ExceptionInboxItem[] {
    return inbox.filter((i) => i.domain === domain);
}

function reconcileStepStatus(
    summary: DomainLaneSummary | undefined,
    domainItems: ExceptionInboxItem[],
    cashDifference?: number,
    isCash = false,
): { status: CloseStepStatus; difference: number | null; blocksClose: boolean } {
    if (isCash) {
        const diff = cashDifference ?? 0;
        const blocked = Math.abs(diff) > 0.01 || domainItems.some((i) => i.blocksClose);
        return {
            status: blocked ? 'blocked' : 'complete',
            difference: Math.abs(diff) > 0.01 ? diff : null,
            blocksClose: blocked,
        };
    }

    if (!summary) {
        return { status: 'pending', difference: null, blocksClose: false };
    }

    const integrity = integrityLane(summary);
    const diff = integrity?.difference ?? 0;
    const blocked =
        summary.periodCloseBlocked
        || domainItems.some((i) => i.blocksClose)
        || (integrity != null && integrity.status !== 'RECONCILED' && Math.abs(diff) > 0.01);

    if (blocked) {
        return { status: 'blocked', difference: diff, blocksClose: true };
    }

    const cache = cacheLane(summary);
    if (cache && cache.status !== 'HEALTHY' && Math.abs(cache.difference) > 0.01) {
        return { status: 'warning', difference: cache.difference, blocksClose: false };
    }

    return { status: 'complete', difference: null, blocksClose: false };
}

export function buildCloseChecklist(params: {
    summaries: DomainLaneSummary[];
    inbox: ExceptionInboxItem[];
    readyToClose: boolean;
    asOfDate: string;
    cashDifference?: number;
    governance?: GovernanceDashboard;
    canClosePeriod: boolean;
}): CloseChecklistStep[] {
    const { summaries, inbox, readyToClose, asOfDate, cashDifference, governance, canClosePeriod } = params;
    const steps: CloseChecklistStep[] = [];
    let order = 1;

    for (const domain of DOMAIN_ORDER) {
        const meta = DOMAIN_STEP_META[domain];
        const summary = summaries.find((s) => s.domain === domain);
        const domainItems = domainInboxItems(inbox, domain);
        const isCash = domain === 'cash';
        const { status, difference, blocksClose } = reconcileStepStatus(
            summary,
            domainItems,
            cashDifference,
            isCash,
        );

        steps.push({
            id: `step-${domain}`,
            order: order++,
            title: meta.title,
            description: meta.description,
            accountCode: meta.accountCode,
            status,
            blocksClose,
            difference,
            exceptionCount: domainItems.length,
            estimatedMinutes: meta.minutes,
            path: isCash ? domainReconciliationPath('cash', asOfDate) : domainReconciliationPath(domain, asOfDate),
            substeps: domainItems.slice(0, 8).map((item) => ({
                id: item.id,
                label: item.title,
                amount: item.amount,
                exceptionId: item.id,
                blocksClose: item.blocksClose,
            })),
        });
    }

    const cacheWarnings = inbox.filter((i) => i.id.startsWith('warn-cache-'));
    steps.push({
        id: 'step-refresh-caches',
        order: order++,
        title: 'Refresh stored balances',
        description: 'Update supplier, customer, and product cache fields from open documents.',
        status: cacheWarnings.length > 0 ? 'warning' : readyToClose ? 'complete' : 'pending',
        blocksClose: false,
        difference: cacheWarnings[0]?.amount ?? null,
        exceptionCount: cacheWarnings.length,
        estimatedMinutes: 10,
        path: '/accounting/financial-diagnostics',
        substeps: cacheWarnings.map((item) => ({
            id: item.id,
            label: item.title,
            amount: item.amount,
            exceptionId: item.id,
            blocksClose: false,
        })),
    });

    const pendingApprovals = governance?.pendingSignoffs?.length ?? 0;
    steps.push({
        id: 'step-review-journals',
        order: order++,
        title: 'Review journals & approvals',
        description: 'Clear draft entries and pending journal approvals before close.',
        status: readyToClose ? (pendingApprovals > 0 ? 'warning' : 'complete') : 'locked',
        blocksClose: false,
        difference: null,
        exceptionCount: pendingApprovals,
        estimatedMinutes: 10,
        path: ledgerReviewPath(asOfDate),
        substeps: [],
    });

    const hasSnapshotForPeriod = (governance?.recentSnapshots ?? []).some(
        (s) => s.asOfDate === asOfDate,
    );
    steps.push({
        id: 'step-capture-snapshot',
        order: order++,
        title: 'Capture financial snapshot',
        description: 'Freeze reconciliation evidence for audit and period sign-off.',
        status: hasSnapshotForPeriod
            ? 'complete'
            : readyToClose
              ? 'pending'
              : 'locked',
        blocksClose: false,
        difference: null,
        exceptionCount: 0,
        estimatedMinutes: 5,
        path: periodCloseWorkspacePath(asOfDate),
        substeps: [],
    });

    steps.push({
        id: 'step-close-period',
        order: order++,
        title: 'Close the period',
        description: 'Lock the period after all control accounts reconcile.',
        status: !canClosePeriod
            ? 'locked'
            : readyToClose
              ? 'pending'
              : 'blocked',
        blocksClose: !readyToClose,
        difference: null,
        exceptionCount: inbox.filter((i) => i.blocksClose).length,
        estimatedMinutes: 5,
        path: periodCloseWorkspacePath(asOfDate),
        substeps: [],
    });

    return steps;
}

export function checklistProgress(steps: CloseChecklistStep[]): {
    completed: number;
    total: number;
    blockingRemaining: number;
} {
    const actionable = steps.filter((s) => s.id !== 'step-close-period');
    const completed = actionable.filter((s) => s.status === 'complete').length;
    const blockingRemaining = steps.filter((s) => s.blocksClose && s.status === 'blocked').length;
    return { completed, total: actionable.length, blockingRemaining };
}
