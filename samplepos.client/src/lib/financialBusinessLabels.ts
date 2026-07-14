import type { FinancialDomain, FinancialLaneResult, DomainLaneSummary } from '../types/financialLane';
import { formatCurrency } from '../utils/currency';

/** Maps technical reconciliation labels to accountant-facing language. */
const LABEL_MAP: Record<string, string> = {
    'GL (Net Active)': 'General Ledger Balance',
    'GL Balance': 'General Ledger Balance',
    'Open-item Subledger': 'Outstanding Balance',
    'Open-item Balance': 'Outstanding Balance',
    'Batch Subledger': 'Inventory Valuation',
    'Supplier Cache': 'Stored Supplier Balances',
    'Customer Cache': 'Stored Customer Balances',
    'Product Cache': 'Stored Product Values',
    'Gross Posted': 'Total Posted Amount',
    'Net Active': 'Active Balance',
    'Net Active (Customer Scope)': 'Active Customer Balance',
    'Integrity Difference': 'Difference',
    'Cache drift': 'Balances need refresh',
    Healthy: 'Up to date',
    Investigate: 'Needs review',
};

const DOMAIN_BUSINESS: Record<FinancialDomain, string> = {
    ap: 'Suppliers',
    ar: 'Customers',
    inventory: 'Inventory',
    cash: 'Cash',
    wht: 'Withholding Tax',
};

export type HealthTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface HealthDomainCard {
    id: string;
    title: string;
    tone: HealthTone;
    difference: number;
    summary: string;
    navigateTo: string;
    actionLabel: string;
}

export interface ControlIssue {
    id: string;
    domain: FinancialDomain | 'cash';
    title: string;
    amount: number;
    reason: string;
    navigateTo: string;
    primaryAction: string;
    secondaryActions: Array<{ label: string; path: string }>;
}

export interface ControlWarning {
    id: string;
    title: string;
    description: string;
    actionLabel: string;
    navigateTo: string;
}

export interface ControlTask {
    id: string;
    title: string;
    description: string;
    path: string;
    priority: 'high' | 'normal';
}

export function toBusinessLabel(label: string): string {
    return LABEL_MAP[label] ?? label;
}

export function domainBusinessName(domain: FinancialDomain): string {
    return DOMAIN_BUSINESS[domain];
}

export function translateRecommendedAction(action: string | null): string | null {
    if (!action) return null;
    if (action.includes('POST /api/') || action.includes('recalc-') || action.includes('rebuild-')) {
        return 'Refresh stored balances from source documents';
    }
    if (action.includes('open-item vs GL') || action.includes('integrity')) {
        return 'Review source documents and post missing journal entries';
    }
    if (action.includes('cache heal')) {
        return 'Correct the underlying documents — do not refresh balances until resolved';
    }
    return action.replace(/\bopen-item\b/gi, 'outstanding balance').replace(/\bGL\b/g, 'general ledger');
}

export function integrityLane(summary: DomainLaneSummary): FinancialLaneResult | undefined {
    return summary.lanes?.find((l) => l.lane === 'integrity');
}

export function cacheLane(summary: DomainLaneSummary): FinancialLaneResult | undefined {
    return summary.lanes?.find((l) => l.lane === 'cache');
}

function domainHealthTone(summary: DomainLaneSummary): HealthTone {
    if (summary.periodCloseBlocked) return 'danger';
    const cache = cacheLane(summary);
    if (cache && cache.status !== 'HEALTHY' && Math.abs(cache.difference) > 0.01) return 'warning';
    const integrity = integrityLane(summary);
    if (integrity?.status === 'RECONCILED') return 'success';
    return 'neutral';
}

import { domainReconciliationPath } from './financialWorkspaceRoutes';

export function domainNavigatePath(
    domain: FinancialDomain,
    asOfDate?: string,
    highlight?: string,
): string {
    return domainReconciliationPath(domain, asOfDate, highlight);
}

export function domainActionLabel(domain: FinancialDomain, tone: HealthTone): string {
    if (tone === 'danger') {
        switch (domain) {
            case 'ap':
                return 'Review supplier balances';
            case 'ar':
                return 'Review customer balances';
            case 'inventory':
                return 'Review inventory difference';
            case 'cash':
                return 'Review cash accounts';
            case 'wht':
                return 'Review withholding tax';
        }
    }
    if (tone === 'warning') return 'Refresh balances';
    return 'View details';
}

export function buildHealthCards(
    summaries: DomainLaneSummary[],
    cashDifference?: number,
): HealthDomainCard[] {
    const cards: HealthDomainCard[] = summaries.map((s) => {
        const integrity = integrityLane(s);
        const tone = domainHealthTone(s);
        const diff = integrity?.difference ?? 0;
        let summary: string;
        if (tone === 'success') summary = 'Reconciled — ready for period close';
        else if (tone === 'danger') summary = `Difference of ${formatCurrency(Math.abs(diff))} blocks period close`;
        else if (tone === 'warning') summary = 'Stored balances may be out of date';
        else summary = 'No data available';

        return {
            id: s.domain,
            title: domainBusinessName(s.domain),
            tone,
            difference: diff,
            summary,
            navigateTo: domainNavigatePath(s.domain),
            actionLabel: domainActionLabel(s.domain, tone),
        };
    });

    const cashTone: HealthTone =
        cashDifference !== undefined && Math.abs(cashDifference) > 0.01 ? 'danger' : 'success';
    if (!cards.some((c) => c.id === 'cash')) {
        cards.unshift({
            id: 'cash',
            title: 'Cash',
            tone: cashTone,
            difference: cashDifference ?? 0,
            summary:
                cashTone === 'success'
                    ? 'Cash accounts reconciled'
                    : `Cash difference of ${formatCurrency(Math.abs(cashDifference ?? 0))}`,
            navigateTo: '/accounting/banking',
            actionLabel: cashTone === 'success' ? 'View banking' : 'Reconcile cash',
        });
    }

    const extras: HealthDomainCard[] = [
        {
            id: 'bank',
            title: 'Bank',
            tone: 'neutral',
            difference: 0,
            summary: 'Reconcile bank statements against transactions',
            navigateTo: '/accounting/banking',
            actionLabel: 'Reconcile bank',
        },
        {
            id: 'gl',
            title: 'General Ledger',
            tone: summaries.some((s) => s.periodCloseBlocked) ? 'warning' : 'success',
            difference: 0,
            summary: summaries.some((s) => s.periodCloseBlocked)
                ? 'Control accounts need attention before close'
                : 'Control accounts in balance',
            navigateTo: '/accounting/general-ledger',
            actionLabel: 'View ledger',
        },
        {
            id: 'tax',
            title: 'Tax',
            tone: 'neutral',
            difference: 0,
            summary: 'Review tax postings and compliance',
            navigateTo: '/accounting/tax-engine',
            actionLabel: 'Review tax',
        },
    ];

    return [...cards, ...extras];
}

function issueTitle(domain: FinancialDomain, integrity: FinancialLaneResult): string {
    switch (domain) {
        case 'inventory':
            return 'Inventory valuation difference';
        case 'ar':
            return 'Customer balance does not match ledger';
        case 'ap':
            return 'Supplier balance does not match ledger';
        case 'cash':
            return 'Cash account difference';
        case 'wht':
            return 'Withholding tax ledger difference';
        default:
            return integrity.title.replace(/Accounting Integrity/i, 'Reconciliation');
    }
}

function issueReason(domain: FinancialDomain, integrity: FinancialLaneResult): string {
    const count = integrity.exceptions.length;
    if (count > 0) {
        const entity = integrity.exceptions[0]?.entityName;
        switch (domain) {
            case 'inventory':
                return count === 1 && entity
                    ? `1 batch difference — ${entity}`
                    : `${count} inventory batches with valuation differences`;
            case 'ar':
                return count === 1 && entity
                    ? `1 customer with an outstanding balance mismatch — ${entity}`
                    : `${count} customers with balance mismatches`;
            case 'ap':
                return count === 1 && entity
                    ? `1 supplier bill or payment not reflected in the ledger — ${entity}`
                    : `${count} suppliers with balance mismatches`;
            default:
                return `${count} item${count === 1 ? '' : 's'} require review`;
        }
    }
    return translateRecommendedAction(integrity.recommendedAction) ?? 'Source documents and ledger are out of balance';
}

export function buildBlockingIssues(summaries: DomainLaneSummary[]): ControlIssue[] {
    return summaries
        .filter((s) => s.periodCloseBlocked)
        .map((s) => {
            const integrity = integrityLane(s)!;
            const secondary: ControlIssue['secondaryActions'] = [
                { label: 'View ledger', path: '/accounting/general-ledger' },
                { label: 'Create journal entry', path: '/accounting/journal-entries' },
            ];
            if (s.domain === 'inventory') {
                secondary.unshift({ label: 'Open inventory report', path: '/reports/inventory/reconciliation' });
            }
            if (s.domain === 'ar') {
                secondary.unshift({ label: 'Review customer payments', path: '/accounting/customer-payments' });
            }
            if (s.domain === 'ap') {
                secondary.unshift({ label: 'Review supplier payments', path: '/accounting/supplier-payments' });
            }

            return {
                id: `block-${s.domain}`,
                domain: s.domain,
                title: issueTitle(s.domain, integrity),
                amount: integrity.difference,
                reason: issueReason(s.domain, integrity),
                navigateTo: domainNavigatePath(s.domain),
                primaryAction: domainActionLabel(s.domain, 'danger'),
                secondaryActions: secondary,
            };
        });
}

export function buildWarnings(summaries: DomainLaneSummary[]): ControlWarning[] {
    const warnings: ControlWarning[] = [];

    for (const s of summaries) {
        const cache = cacheLane(s);
        if (cache && cache.status !== 'HEALTHY' && Math.abs(cache.difference) > 0.01) {
            warnings.push({
                id: `warn-cache-${s.domain}`,
                title: `${domainBusinessName(s.domain)} balances need refresh`,
                description: `Stored balances differ from outstanding documents by ${formatCurrency(Math.abs(cache.difference))}. This does not block period close.`,
                actionLabel: 'Refresh balances',
                navigateTo: '/accounting/financial-diagnostics',
            });
        }
    }

    return warnings;
}

export function buildTasks(
    summaries: DomainLaneSummary[],
    hasBlocking: boolean,
): ControlTask[] {
    const tasks: ControlTask[] = [
        {
            id: 'inventory-valuation',
            title: 'Run inventory valuation',
            description: 'Compare inventory value to the general ledger',
            path: '/reports/inventory/valuation',
            priority: summaries.some((s) => s.domain === 'inventory' && s.periodCloseBlocked)
                ? 'high'
                : 'normal',
        },
        {
            id: 'reconcile-bank',
            title: 'Reconcile bank',
            description: 'Match bank statements to recorded transactions',
            path: '/accounting/banking',
            priority: 'normal',
        },
        {
            id: 'review-journals',
            title: 'Review journals',
            description: 'Review posted and draft journal entries',
            path: '/accounting/journal-entries',
            priority: hasBlocking ? 'high' : 'normal',
        },
        {
            id: 'post-drafts',
            title: 'Post draft journals',
            description: 'Post pending journal entries to the ledger',
            path: '/accounting/journal-entries',
            priority: hasBlocking ? 'high' : 'normal',
        },
        {
            id: 'approve-adjustments',
            title: 'Approve adjustments',
            description: 'Review and approve pending journal adjustments',
            path: '/accounting/je-approval',
            priority: 'normal',
        },
    ];

    return tasks.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1));
}

export function formatPeriodLabel(year: number, month: number): string {
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export const TONE_STYLES: Record<
    HealthTone,
    { border: string; bg: string; dot: string; text: string }
> = {
    success: {
        border: 'border-green-200',
        bg: 'bg-green-50',
        dot: 'bg-green-500',
        text: 'text-green-800',
    },
    warning: {
        border: 'border-amber-200',
        bg: 'bg-amber-50',
        dot: 'bg-amber-500',
        text: 'text-amber-800',
    },
    danger: {
        border: 'border-red-200',
        bg: 'bg-red-50',
        dot: 'bg-red-500',
        text: 'text-red-800',
    },
    neutral: {
        border: 'border-gray-200',
        bg: 'bg-white',
        dot: 'bg-gray-400',
        text: 'text-gray-700',
    },
};
