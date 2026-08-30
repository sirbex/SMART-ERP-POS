/**
 * Proof: GR list exposes SAP/Odoo billing lane (billingStatus + supplierBillNumber).
 * Uses local DB when available; skips cleanly on CI without schema.
 */
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { goodsReceiptRepository } from './goodsReceiptRepository.js';

const { Pool } = pg;

describe('goodsReceiptRepository.listGRs — billing status', () => {
    let pool: pg.Pool;
    let schemaReady = false;

    beforeAll(async () => {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system',
        });
        try {
            await pool.query('SELECT 1 FROM goods_receipts LIMIT 1');
            schemaReady = true;
        } catch {
            schemaReady = false;
        }
    });

    afterAll(async () => {
        if (pool) await pool.end();
    });

    it('returns billingStatus and supplierBillNumber on each row', async () => {
        if (!schemaReady) {
            console.warn('SKIP: goods_receipts table not available');
            return;
        }
        const { grs } = await goodsReceiptRepository.listGRs(pool, 1, 10);
        expect(grs.length).toBeGreaterThan(0);
        for (const gr of grs) {
            expect(gr).toHaveProperty('billingStatus');
            expect(['DRAFT_GR', 'TO_INVOICE', 'INVOICED', 'REVERSED', 'CANCELLED', 'NOT_APPLICABLE']).toContain(gr.billingStatus);
            if (gr.billingStatus === 'INVOICED') {
                expect(gr.supplierBillNumber).toBeTruthy();
            }
            if (gr.billingStatus === 'TO_INVOICE') {
                expect(gr.status).toBe('COMPLETED');
                expect(gr.supplierBillNumber ?? null).toBeFalsy();
                expect(gr.isReversed).not.toBe(true);
            }
            if (gr.billingStatus === 'REVERSED') {
                expect(gr.status).toBe('COMPLETED');
                expect(gr.isReversed).toBe(true);
            }
            if (gr.billingStatus === 'DRAFT_GR') {
                expect(gr.status).toBe('DRAFT');
            }
        }
    });

    it('TO_INVOICE filter returns only completed uninvoiced GRs', async () => {
        if (!schemaReady) return;
        const { grs } = await goodsReceiptRepository.listGRs(pool, 1, 20, { billingStatus: 'TO_INVOICE' });
        for (const gr of grs) {
            expect(gr.status).toBe('COMPLETED');
            expect(gr.billingStatus).toBe('TO_INVOICE');
            expect(gr.isReversed).not.toBe(true);
        }
    });

    it('INVOICED filter returns only completed GRs with a bill', async () => {
        if (!schemaReady) return;
        const { grs } = await goodsReceiptRepository.listGRs(pool, 1, 20, { billingStatus: 'INVOICED' });
        for (const gr of grs) {
            expect(gr.status).toBe('COMPLETED');
            expect(gr.billingStatus).toBe('INVOICED');
            expect(gr.supplierBillNumber).toBeTruthy();
        }
    });

    it('reversed GRs are REVERSED billing lane and never in TO_INVOICE filter', async () => {
        if (!schemaReady) return;
        const { grs: all } = await goodsReceiptRepository.listGRs(pool, 1, 100);
        const reversed = all.filter((g) => g.isReversed === true || g.billingStatus === 'REVERSED');
        for (const gr of reversed) {
            expect(gr.billingStatus).toBe('REVERSED');
            expect(gr.isReversed).toBe(true);
        }
        const { grs: toInvoice } = await goodsReceiptRepository.listGRs(pool, 1, 100, { billingStatus: 'TO_INVOICE' });
        const reversedIds = new Set(reversed.map((g) => g.id));
        for (const gr of toInvoice) {
            expect(reversedIds.has(gr.id)).toBe(false);
        }

        const { grs: reversedOnly } = await goodsReceiptRepository.listGRs(pool, 1, 100, {
            billingStatus: 'REVERSED',
        });
        for (const gr of reversedOnly) {
            expect(gr.billingStatus).toBe('REVERSED');
            expect(gr.isReversed).toBe(true);
        }
        for (const gr of reversed) {
            expect(reversedOnly.some((r) => r.id === gr.id)).toBe(true);
        }
    });
});
