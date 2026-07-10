import { describe, expect, it } from 'vitest';
import type { DomainLaneSummary } from '../types/financialLane';
import { buildCloseChecklist, checklistProgress } from '../lib/financialCloseChecklist';
import { buildExceptionInbox } from '../lib/financialWorkspace';

function makeSummary(
    domain: DomainLaneSummary['domain'],
    blocked: boolean,
    difference: number,
): DomainLaneSummary {
    return {
        domain,
        domainTitle: domain,
        periodCloseBlocked: blocked,
        lanes: [
            {
                domain,
                lane: 'integrity',
                title: `${domain} integrity`,
                subtitle: '',
                status: blocked ? 'DISCREPANCY' : 'RECONCILED',
                leftLabel: 'GL',
                leftAmount: 1000,
                rightLabel: 'Sub',
                rightAmount: 1000 - difference,
                difference,
                periodCloseBlocking: true,
                gatesPeriodClose: true,
                severity: blocked ? 'critical' : 'informational',
                recommendedAction: null,
                asOfDate: '2026-07-05',
                lastCalculated: '2026-07-05',
                exceptions: [],
                auditJournals: [],
            },
        ],
    };
}

describe('financialCloseChecklist', () => {
    it('marks blocked domains and includes substeps from inbox', () => {
        const summaries = [
            makeSummary('ap', true, 500),
            makeSummary('ar', false, 0),
            makeSummary('inventory', false, 0),
        ];
        const inbox = buildExceptionInbox(summaries);
        const steps = buildCloseChecklist({
            summaries,
            inbox,
            readyToClose: false,
            asOfDate: '2026-07-05',
            canClosePeriod: true,
        });

        const apStep = steps.find((s) => s.id === 'step-ap');
        expect(apStep?.status).toBe('blocked');
        expect(apStep?.blocksClose).toBe(true);
        expect(apStep?.substeps.length).toBeGreaterThan(0);

        const closeStep = steps.find((s) => s.id === 'step-close-period');
        expect(closeStep?.status).toBe('blocked');
    });

    it('reports progress when reconcile steps complete', () => {
        const summaries = [
            makeSummary('ap', false, 0),
            makeSummary('ar', false, 0),
            makeSummary('inventory', false, 0),
        ];
        const inbox = buildExceptionInbox(summaries);
        const steps = buildCloseChecklist({
            summaries,
            inbox,
            readyToClose: true,
            asOfDate: '2026-07-05',
            canClosePeriod: true,
            governance: {
                materiality: [],
                latestSnapshot: null,
                openAlerts: [],
                pendingSignoffs: [],
                recentSnapshots: [{ asOfDate: '2026-07-05' } as never],
            },
        });

        const progress = checklistProgress(steps);
        expect(progress.completed).toBeGreaterThan(0);
        expect(steps.find((s) => s.id === 'step-close-period')?.status).toBe('pending');
    });
});
