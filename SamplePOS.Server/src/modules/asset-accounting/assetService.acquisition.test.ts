/**
 * Unit tests for the Asset Acquisition GL engine.
 *
 * These tests are pure (no DB, no network) and verify the core accounting law:
 *
 *   OPENING mode  → Cr Opening Balance Equity (3050). Cash is NEVER touched.
 *   PURCHASE mode → Cr Cash (1010) or Accounts Payable (2100).
 *
 * The buildAssetAcquisitionGLLines() function is the SINGLE posting engine
 * for all asset acquisitions. No other path may build asset GL lines.
 */
import { describe, it, expect } from '@jest/globals';
import { buildAssetAcquisitionGLLines } from './assetService.js';
import { AccountCodes } from '../../services/glEntryService.js';

const BASE = {
    assetAccountCode: '1500',
    acquisitionCost: 5_000_000,
    assetId: 'asset-uuid-001',
    assetName: 'Test Computer',
    assetNumber: 'FA-2026-0001',
} as const;

describe('buildAssetAcquisitionGLLines — OPENING mode', () => {
    it('credits Opening Balance Equity (3050), never Cash', () => {
        const result = buildAssetAcquisitionGLLines(
            'OPENING', undefined, BASE.assetAccountCode,
            BASE.acquisitionCost, BASE.assetId, BASE.assetName, BASE.assetNumber,
        );
        expect(result.creditAccountCode).toBe(AccountCodes.OPENING_BALANCE_EQUITY);
        expect(result.creditAccountCode).toBe('3050');
        // Cash must not appear in any line
        const cashLine = result.lines.find(l => l.accountCode === AccountCodes.CASH);
        expect(cashLine).toBeUndefined();
        // AP must not appear either
        const apLine = result.lines.find(l => l.accountCode === AccountCodes.ACCOUNTS_PAYABLE);
        expect(apLine).toBeUndefined();
    });

    it('uses OPENING_BALANCE_WIZARD as the posting source', () => {
        const result = buildAssetAcquisitionGLLines(
            'OPENING', undefined, BASE.assetAccountCode,
            BASE.acquisitionCost, BASE.assetId, BASE.assetName, BASE.assetNumber,
        );
        expect(result.source).toBe('OPENING_BALANCE_WIZARD');
    });

    it('GL lines are balanced: Dr FixedAssets / Cr OpeningEquity for full cost', () => {
        const result = buildAssetAcquisitionGLLines(
            'OPENING', undefined, BASE.assetAccountCode,
            BASE.acquisitionCost, BASE.assetId, BASE.assetName, BASE.assetNumber,
        );
        const debitLine = result.lines.find(l => l.debitAmount > 0);
        const creditLine = result.lines.find(l => l.creditAmount > 0);
        expect(debitLine?.accountCode).toBe('1500');
        expect(debitLine?.debitAmount).toBe(5_000_000);
        expect(creditLine?.accountCode).toBe('3050');
        expect(creditLine?.creditAmount).toBe(5_000_000);
    });

    it('throws ValidationError when paymentMethod is supplied in OPENING mode', () => {
        const call = () => buildAssetAcquisitionGLLines(
            'OPENING', 'CASH', BASE.assetAccountCode,
            BASE.acquisitionCost, BASE.assetId, BASE.assetName, BASE.assetNumber,
        );
        expect(call).toThrow();
        let thrown: unknown;
        try { call(); } catch (e) { thrown = e; }
        expect((thrown as { statusCode?: number }).statusCode).toBe(400);
        expect((thrown as Error).message).toMatch(/payment method/i);
    });

    it('throws for OPENING + AP', () => {
        const call = () => buildAssetAcquisitionGLLines(
            'OPENING', 'AP', BASE.assetAccountCode,
            BASE.acquisitionCost, BASE.assetId, BASE.assetName, BASE.assetNumber,
        );
        expect(call).toThrow();
        let thrown: unknown;
        try { call(); } catch (e) { thrown = e; }
        expect((thrown as { statusCode?: number }).statusCode).toBe(400);
    });
});

describe('buildAssetAcquisitionGLLines — PURCHASE mode', () => {
    it('PURCHASE + CASH: credits Cash (1010), uses EXPENSE_PAYMENT source', () => {
        const result = buildAssetAcquisitionGLLines(
            'PURCHASE', 'CASH', BASE.assetAccountCode,
            BASE.acquisitionCost, BASE.assetId, BASE.assetName, BASE.assetNumber,
        );
        expect(result.creditAccountCode).toBe(AccountCodes.CASH);
        expect(result.creditAccountCode).toBe('1010');
        expect(result.source).toBe('EXPENSE_PAYMENT');
        // Opening equity must not appear
        const obeeLine = result.lines.find(l => l.accountCode === AccountCodes.OPENING_BALANCE_EQUITY);
        expect(obeeLine).toBeUndefined();
    });

    it('PURCHASE + BANK: credits Cash account (1010), uses EXPENSE_PAYMENT source', () => {
        const result = buildAssetAcquisitionGLLines(
            'PURCHASE', 'BANK', BASE.assetAccountCode,
            BASE.acquisitionCost, BASE.assetId, BASE.assetName, BASE.assetNumber,
        );
        expect(result.creditAccountCode).toBe(AccountCodes.CASH);
        expect(result.source).toBe('EXPENSE_PAYMENT');
    });

    it('PURCHASE + AP: credits Accounts Payable (2100), uses PURCHASE_BILL source', () => {
        const result = buildAssetAcquisitionGLLines(
            'PURCHASE', 'AP', BASE.assetAccountCode,
            BASE.acquisitionCost, BASE.assetId, BASE.assetName, BASE.assetNumber,
        );
        expect(result.creditAccountCode).toBe(AccountCodes.ACCOUNTS_PAYABLE);
        expect(result.creditAccountCode).toBe('2100');
        expect(result.source).toBe('PURCHASE_BILL');
    });

    it('GL lines are balanced for PURCHASE + CASH', () => {
        const result = buildAssetAcquisitionGLLines(
            'PURCHASE', 'CASH', BASE.assetAccountCode,
            BASE.acquisitionCost, BASE.assetId, BASE.assetName, BASE.assetNumber,
        );
        const debitLine = result.lines.find(l => l.debitAmount > 0);
        const creditLine = result.lines.find(l => l.creditAmount > 0);
        expect(debitLine?.accountCode).toBe('1500');
        expect(debitLine?.debitAmount).toBe(5_000_000);
        expect(creditLine?.accountCode).toBe('1010');
        expect(creditLine?.creditAmount).toBe(5_000_000);
    });

    it('throws ValidationError when no paymentMethod supplied in PURCHASE mode', () => {
        const call = () => buildAssetAcquisitionGLLines(
            'PURCHASE', undefined, BASE.assetAccountCode,
            BASE.acquisitionCost, BASE.assetId, BASE.assetName, BASE.assetNumber,
        );
        expect(call).toThrow();
        let thrown: unknown;
        try { call(); } catch (e) { thrown = e; }
        expect((thrown as { statusCode?: number }).statusCode).toBe(400);
        expect((thrown as Error).message).toMatch(/payment method/i);
    });
});

describe('buildAssetAcquisitionGLLines — general invariants', () => {
    it('always produces exactly 2 GL lines', () => {
        const r1 = buildAssetAcquisitionGLLines('OPENING', undefined, '1500', 1_000, 'id', 'n', 'FA-001');
        const r2 = buildAssetAcquisitionGLLines('PURCHASE', 'CASH', '1500', 1_000, 'id', 'n', 'FA-001');
        const r3 = buildAssetAcquisitionGLLines('PURCHASE', 'AP', '1500', 1_000, 'id', 'n', 'FA-001');
        expect(r1.lines).toHaveLength(2);
        expect(r2.lines).toHaveLength(2);
        expect(r3.lines).toHaveLength(2);
    });

    it('debit and credit lines always sum to the same amount (balanced)', () => {
        const cost = 7_500_000;
        for (const result of [
            buildAssetAcquisitionGLLines('OPENING', undefined, '1500', cost, 'id', 'n', 'FA-001'),
            buildAssetAcquisitionGLLines('PURCHASE', 'CASH', '1500', cost, 'id', 'n', 'FA-001'),
            buildAssetAcquisitionGLLines('PURCHASE', 'AP', '1500', cost, 'id', 'n', 'FA-001'),
        ]) {
            const totalDebit = result.lines.reduce((s, l) => s + l.debitAmount, 0);
            const totalCredit = result.lines.reduce((s, l) => s + l.creditAmount, 0);
            expect(totalDebit).toBe(cost);
            expect(totalCredit).toBe(cost);
        }
    });

    it('OPENING and PURCHASE never produce the same credit account', () => {
        const opening = buildAssetAcquisitionGLLines('OPENING', undefined, '1500', 1_000, 'id', 'n', 'FA-001');
        const purchase = buildAssetAcquisitionGLLines('PURCHASE', 'CASH', '1500', 1_000, 'id', 'n', 'FA-001');
        expect(opening.creditAccountCode).not.toBe(purchase.creditAccountCode);
    });
});
