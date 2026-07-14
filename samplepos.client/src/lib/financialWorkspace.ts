import type { FinancialDomain, DomainLaneSummary } from '../types/financialLane';
import type { GovernanceDashboard } from '../types/financialGovernance';
import { formatCurrency } from '../utils/currency';
import {
    buildHealthCards,
    cacheLane,
    domainBusinessName,
    domainNavigatePath,
    domainActionLabel,
    integrityLane,
    type HealthDomainCard,
} from './financialBusinessLabels';
import { domainReconciliationPath } from './financialWorkspaceRoutes';

export type ExceptionDomain = FinancialDomain | 'cash' | 'gl' | 'bank';
export type ExceptionPriority = 'high' | 'medium' | 'low';

export interface ExceptionInboxItem {
    id: string;
    domain: ExceptionDomain;
    domainLabel: string;
    priority: ExceptionPriority;
    blocksClose: boolean;
    title: string;
    entityName: string;
    entityId: string;
    amount: number;
    reason: string;
    navigateTo: string;
    primaryAction: string;
}

export interface DomainExceptionCount {
    domain: ExceptionDomain;
    label: string;
    count: number;
}

export interface ActionQueueItem {
    id: string;
    rank: number;
    title: string;
    description: string;
    estimatedMinutes: number;
    priority: 'critical' | 'high' | 'normal';
    path: string;
    exceptionId?: string;
}

export interface WorkspaceKpi {
    id: string;
    label: string;
    value: string | number;
    tone: 'success' | 'warning' | 'danger' | 'neutral';
    hint?: string;
    path?: string;
}

export interface WorkspaceHeroData {
    totalNeedingAttention: number;
    blockingCount: number;
    warningCount: number;
    estimatedMinutes: number;
    readyToClose: boolean;
    nextAction: ActionQueueItem | null;
}

export interface WorkspaceDomainCard extends HealthDomainCard {
    isHealthy: boolean;
    why: string;
    attention: string;
    nextAction: string;
}

function entityExceptionTitle(domain: FinancialDomain, entityName: string): string {
    switch (domain) {
        case 'inventory':
            return `Inventory valuation — ${entityName}`;
        case 'ar':
            return `Customer balance mismatch — ${entityName}`;
        case 'ap':
            return `Supplier balance mismatch — ${entityName}`;
        default:
            return `Reconciliation — ${entityName}`;
    }
}

function entityExceptionReason(domain: FinancialDomain): string {
    switch (domain) {
        case 'inventory':
            return 'Inventory valuation does not match the general ledger';
        case 'ar':
            return 'Outstanding customer balance does not match the ledger';
        case 'ap':
            return 'Outstanding supplier balance does not match the ledger';
        default:
            return 'Supporting balance does not match the general ledger';
    }
}

export function buildExceptionInbox(
    summaries: DomainLaneSummary[],
    cashDifference?: number,
): ExceptionInboxItem[] {
    const items: ExceptionInboxItem[] = [];

    for (const summary of summaries) {
        const integrity = integrityLane(summary);
        if (!integrity) continue;

        if ((integrity.exceptions ?? []).length > 0) {
            for (const ex of integrity.exceptions ?? []) {
                if (Math.abs(ex.difference) <= 0.01) continue;
                items.push({
                    id: `exc-${summary.domain}-${ex.entityId}`,
                    domain: summary.domain,
                    domainLabel: domainBusinessName(summary.domain),
                    priority: summary.periodCloseBlocked ? 'high' : 'medium',
                    blocksClose: summary.periodCloseBlocked,
                    title: entityExceptionTitle(summary.domain, ex.entityName),
                    entityName: ex.entityName,
                    entityId: ex.entityId,
                    amount: ex.difference,
                    reason: entityExceptionReason(summary.domain),
                    navigateTo: domainNavigatePath(summary.domain, undefined, ex.entityId),
                    primaryAction: domainActionLabel(summary.domain, 'danger'),
                });
            }
        } else if (summary.periodCloseBlocked && Math.abs(integrity.difference) > 0.01) {
            items.push({
                id: `exc-${summary.domain}-domain`,
                domain: summary.domain,
                domainLabel: domainBusinessName(summary.domain),
                priority: 'high',
                blocksClose: true,
                title: `${domainBusinessName(summary.domain)} control account difference`,
                entityName: domainBusinessName(summary.domain),
                entityId: summary.domain,
                amount: integrity.difference,
                reason: entityExceptionReason(summary.domain),
                navigateTo: domainNavigatePath(summary.domain),
                primaryAction: domainActionLabel(summary.domain, 'danger'),
            });
        }

        const cache = cacheLane(summary);
        if (cache && cache.status !== 'HEALTHY' && Math.abs(cache.difference) > 0.01) {
            items.push({
                id: `warn-cache-${summary.domain}`,
                domain: summary.domain,
                domainLabel: domainBusinessName(summary.domain),
                priority: 'medium',
                blocksClose: false,
                title: `${domainBusinessName(summary.domain)} balances need refresh`,
                entityName: domainBusinessName(summary.domain),
                entityId: summary.domain,
                amount: cache.difference,
                reason: 'Stored balances are out of date — does not block period close',
                navigateTo: '/accounting/financial-diagnostics',
                primaryAction: 'Refresh balances',
            });
        }
    }

    if (cashDifference !== undefined && Math.abs(cashDifference) > 0.01) {
        items.push({
            id: 'exc-cash-summary',
            domain: 'cash',
            domainLabel: 'Cash',
            priority: 'high',
            blocksClose: true,
            title: 'Cash account difference',
            entityName: 'Cash (1010)',
            entityId: 'cash',
            amount: cashDifference,
            reason: 'Cash subledger does not match the general ledger',
            navigateTo: domainReconciliationPath('cash'),
            primaryAction: 'Reconcile cash',
        });
    }

    const priorityOrder: Record<ExceptionPriority, number> = { high: 0, medium: 1, low: 2 };
    return items.sort((a, b) => {
        const p = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (p !== 0) return p;
        return Math.abs(b.amount) - Math.abs(a.amount);
    });
}

export function buildDomainExceptionCounts(items: ExceptionInboxItem[]): DomainExceptionCount[] {
    const domains: Array<{ domain: ExceptionDomain; label: string }> = [
        { domain: 'inventory', label: 'Inventory' },
        { domain: 'ar', label: 'Customers' },
        { domain: 'ap', label: 'Suppliers' },
        { domain: 'cash', label: 'Cash' },
        { domain: 'wht', label: 'Withholding Tax' },
        { domain: 'gl', label: 'General Ledger' },
    ];

    return domains.map(({ domain, label }) => ({
        domain,
        label,
        count: items.filter((i) => i.domain === domain).length,
    }));
}

export function buildActionQueue(
    inbox: ExceptionInboxItem[],
    summaries: DomainLaneSummary[],
): ActionQueueItem[] {
    const actions: ActionQueueItem[] = [];
    let rank = 1;

    for (const item of inbox.filter((i) => i.blocksClose)) {
        actions.push({
            id: `action-${item.id}`,
            rank: rank++,
            title: item.primaryAction,
            description: `${item.title} — ${formatCurrency(Math.abs(item.amount))}`,
            estimatedMinutes: 8,
            priority: 'critical',
            path: item.navigateTo,
            exceptionId: item.id,
        });
    }

    for (const item of inbox.filter((i) => !i.blocksClose && i.priority === 'medium')) {
        actions.push({
            id: `action-${item.id}`,
            rank: rank++,
            title: item.primaryAction,
            description: item.title,
            estimatedMinutes: 5,
            priority: 'high',
            path: item.navigateTo,
            exceptionId: item.id,
        });
    }

    const hasBlockers = inbox.some((i) => i.blocksClose);
    const followUps: Array<Omit<ActionQueueItem, 'rank'>> = [
        {
            id: 'action-bank',
            title: 'Reconcile bank',
            description: 'Match bank statements to recorded transactions',
            estimatedMinutes: 15,
            priority: 'normal',
            path: '/accounting/banking',
        },
        {
            id: 'action-journals',
            title: 'Review journals',
            description: 'Review posted and draft journal entries',
            estimatedMinutes: 10,
            priority: hasBlockers ? 'high' : 'normal',
            path: '/accounting/journal-entries',
        },
        {
            id: 'action-inventory-val',
            title: 'Run inventory valuation',
            description: 'Compare inventory value to the general ledger',
            estimatedMinutes: 10,
            priority: summaries.some((s) => s.domain === 'inventory' && s.periodCloseBlocked)
                ? 'high'
                : 'normal',
            path: '/reports/inventory/valuation',
        },
        {
            id: 'action-approve',
            title: 'Approve adjustments',
            description: 'Review pending journal approvals',
            estimatedMinutes: 5,
            priority: 'normal',
            path: '/accounting/je-approval',
        },
    ];

    if (!hasBlockers) {
        for (const f of followUps) {
            actions.push({ ...f, rank: rank++ });
        }
    } else if (actions.length < 3) {
        for (const f of followUps.slice(0, 3 - actions.length)) {
            actions.push({ ...f, rank: rank++ });
        }
    }

    return actions;
}

export function buildWorkspaceHero(
    inbox: ExceptionInboxItem[],
    actionQueue: ActionQueueItem[],
    readyToClose: boolean,
): WorkspaceHeroData {
    const blockingCount = inbox.filter((i) => i.blocksClose).length;
    const warningCount = inbox.filter((i) => !i.blocksClose).length;
    const estimatedMinutes = actionQueue.reduce((sum, a) => sum + a.estimatedMinutes, 0) || 0;

    return {
        totalNeedingAttention: inbox.length,
        blockingCount,
        warningCount,
        estimatedMinutes: Math.min(estimatedMinutes, 120),
        readyToClose,
        nextAction: actionQueue[0] ?? null,
    };
}

export function buildWorkspaceKpis(
    summaries: DomainLaneSummary[],
    inbox: ExceptionInboxItem[],
    readyToClose: boolean,
    governance?: GovernanceDashboard,
): WorkspaceKpi[] {
    const reconciledDomains = summaries.filter((s) => !s.periodCloseBlocked).length;
    const totalDomains = summaries.length || 1;
    const completionPct = Math.round((reconciledDomains / totalDomains) * 100);
    const blockingCount = inbox.filter((i) => i.blocksClose).length;
    const pendingApprovals = governance?.pendingSignoffs?.length ?? 0;
    const openAlerts = governance?.openAlerts?.length ?? 0;

    return [
        {
            id: 'close-status',
            label: 'Period close',
            value: readyToClose ? 'Ready' : 'Blocked',
            tone: readyToClose ? 'success' : 'danger',
            path: '/accounting/periods',
        },
        {
            id: 'open-exceptions',
            label: 'Open exceptions',
            value: inbox.length,
            tone: inbox.length === 0 ? 'success' : blockingCount > 0 ? 'danger' : 'warning',
            hint: blockingCount > 0 ? `${blockingCount} block close` : undefined,
        },
        {
            id: 'reconciliation-pct',
            label: 'Reconciliation',
            value: `${completionPct}%`,
            tone: completionPct === 100 ? 'success' : completionPct >= 75 ? 'warning' : 'danger',
            hint: `${reconciledDomains}/${totalDomains} domains`,
        },
        {
            id: 'warnings',
            label: 'Warnings',
            value: inbox.filter((i) => !i.blocksClose).length,
            tone: inbox.filter((i) => !i.blocksClose).length > 0 ? 'warning' : 'success',
        },
        {
            id: 'approvals',
            label: 'Open approvals',
            value: pendingApprovals,
            tone: pendingApprovals > 0 ? 'warning' : 'success',
            path: '/accounting/je-approval',
        },
        {
            id: 'drift-alerts',
            label: 'Drift alerts',
            value: openAlerts,
            tone: openAlerts > 0 ? 'warning' : 'success',
            path: '/accounting/reconciliation',
        },
    ];
}

export function buildWorkspaceDomainCards(
    summaries: DomainLaneSummary[],
    cashDifference?: number,
): WorkspaceDomainCard[] {
    return buildHealthCards(summaries, cashDifference).map((card) => {
        const summary = summaries.find((s) => s.domain === card.id);
        const integrity = summary ? integrityLane(summary) : undefined;
        const exceptionCount = (integrity?.exceptions ?? []).filter((e) => Math.abs(e.difference) > 0.01).length ?? 0;
        const isHealthy = card.tone === 'success';

        let attention = 'Nothing requires attention';
        if (card.tone === 'danger') {
            attention =
                exceptionCount > 0
                    ? `${exceptionCount} item${exceptionCount === 1 ? '' : 's'} need review`
                    : 'Control account difference blocks period close';
        } else if (card.tone === 'warning') {
            attention = 'Stored balances may need refresh';
        }

        return {
            ...card,
            isHealthy,
            why: card.summary,
            attention,
            nextAction: card.actionLabel,
        };
    });
}

export function estimateResolutionLabel(minutes: number): string {
    if (minutes <= 0) return 'No action required';
    if (minutes < 60) return `Estimated resolution: ${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem > 0
        ? `Estimated resolution: ${hours}h ${rem}m`
        : `Estimated resolution: ${hours} hour${hours === 1 ? '' : 's'}`;
}
