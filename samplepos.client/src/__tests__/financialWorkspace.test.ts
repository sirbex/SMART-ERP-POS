import { describe, expect, it } from 'vitest';
import type { DomainLaneSummary } from '../types/financialLane';
import { buildExceptionInbox, buildWorkspaceHero, buildActionQueue } from '../lib/financialWorkspace';

describe('financialWorkspace', () => {
    it('buildExceptionInbox does not throw when lanes or exceptions are missing', () => {
        const malformed: DomainLaneSummary[] = [
            {
                domain: 'ar',
                domainTitle: 'Accounts Receivable',
                lanes: [
                    {
                        domain: 'ar',
                        lane: 'integrity',
                        title: 'AR Integrity',
                        subtitle: '',
                        status: 'DISCREPANCY',
                        leftLabel: 'GL',
                        leftAmount: 100,
                        rightLabel: 'Sub',
                        rightAmount: 50,
                        difference: 50,
                        periodCloseBlocking: true,
                        gatesPeriodClose: true,
                        severity: 'critical',
                        recommendedAction: null,
                        asOfDate: '2026-07-05',
                        lastCalculated: '2026-07-05',
                        // exceptions intentionally omitted — API shape drift
                    } as DomainLaneSummary['lanes'][number],
                ],
                periodCloseBlocked: true,
            },
        ];

        expect(() => buildExceptionInbox(malformed)).not.toThrow();
        const inbox = buildExceptionInbox(malformed);
        expect(inbox.length).toBe(1);
        expect(inbox[0].blocksClose).toBe(true);
    });

    it('buildWorkspaceHero handles empty inbox', () => {
        const hero = buildWorkspaceHero([], [], true);
        expect(hero.totalNeedingAttention).toBe(0);
        expect(hero.readyToClose).toBe(true);
    });

    it('buildActionQueue returns follow-up tasks when no blockers', () => {
        const queue = buildActionQueue([], []);
        expect(queue.length).toBeGreaterThan(0);
    });
});
