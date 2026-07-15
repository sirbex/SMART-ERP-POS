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

    it('includes non-blocking VAT remittance review step (Phase 3D E-05)', () => {
        const summaries = [
            makeSummary('ap', false, 0),
            makeSummary('ar', false, 0),
            makeSummary('inventory', false, 0),
            makeSummary('vat', false, 250),
        ];
        // force vat integrity drift for warning status
        const vat = summaries.find((s) => s.domain === 'vat')!;
        vat.periodCloseBlocked = false;
        vat.lanes[0].periodCloseBlocking = false;
        vat.lanes[0].gatesPeriodClose = false;
        vat.lanes[0].difference = 250;
        vat.lanes[0].status = 'DISCREPANCY';

        const steps = buildCloseChecklist({
            summaries,
            inbox: [],
            readyToClose: true,
            asOfDate: '2026-07-05',
            canClosePeriod: true,
        });
        const vatStep = steps.find((s) => s.id === 'step-vat-remittance');
        expect(vatStep).toBeTruthy();
        expect(vatStep?.blocksClose).toBe(false);
        expect(vatStep?.status).toBe('warning');
        expect(vatStep?.path).toContain('/accounting/vat-remittance');
        expect(vatStep?.accountCode).toBe('2300');
    });

    it('includes quarantine and bad-debt E-05 steps with working paths (Phase 5C)', () => {
        const steps = buildCloseChecklist({
            summaries: [makeSummary('ar', false, 0), makeSummary('inventory', false, 0)],
            inbox: [],
            readyToClose: true,
            asOfDate: '2026-07-05',
            canClosePeriod: true,
        });
        const q = steps.find((s) => s.id === 'step-quarantine-aging');
        const bd = steps.find((s) => s.id === 'step-bad-debt-writeoff');
        expect(q?.blocksClose).toBe(false);
        expect(q?.path).toBe('/inventory/quarantine');
        expect(bd?.blocksClose).toBe(false);
        expect(bd?.path).toBe('/accounting/bad-debt');
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
