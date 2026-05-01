/**
 * Credit/Debit Note Zod Schema — Unit Tests
 *
 * Validates the supplier-side schema changes introduced with the SAP-correct CN flow:
 *  - CreateSupplierCreditNoteSchema: accepts amount-only (PRICE_CORRECTION) in place of lines
 *  - CreateSupplierDebitNoteSchema:  accepts amount-only in place of lines
 *  - FULL / PARTIAL note types still require explicit line items
 */

import { describe, it, expect } from '@jest/globals';
import {
    CreateSupplierCreditNoteSchema,
    CreateSupplierDebitNoteSchema,
} from '../../../../shared/zod/creditDebitNote.js';

// ── Shared fixtures ──────────────────────────────────────────────────────────

const validInvoiceId = '11111111-1111-1111-1111-111111111111';

const singleLine = [
    {
        productId: 'prod-001',
        productName: 'Widget A',
        quantity: 2,
        unitCost: 5000,
        taxRate: 0,
    },
];

// ============================================================
// CreateSupplierCreditNoteSchema
// ============================================================

describe('CreateSupplierCreditNoteSchema', () => {

    // ── PRICE_CORRECTION: amount-only path ────────────────────

    describe('PRICE_CORRECTION — amount-only (no lines)', () => {
        it('accepts valid amount without lines', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Supplier overcharged per agreed price',
                noteType: 'PRICE_CORRECTION',
                amount: 1500,
            });
            expect(result.success).toBe(true);
        });

        it('accepts fractional amount (sub-unit currencies)', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Minor price correction',
                noteType: 'PRICE_CORRECTION',
                amount: 0.01,
            });
            expect(result.success).toBe(true);
        });

        it('rejects amount = 0 (must be positive)', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Zero amount is not meaningful',
                noteType: 'PRICE_CORRECTION',
                amount: 0,
            });
            expect(result.success).toBe(false);
            const messages = result.error?.issues.map(i => i.message) ?? [];
            expect(messages.some(m => /positive/i.test(m))).toBe(true);
        });

        it('rejects negative amount', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Negative amount',
                noteType: 'PRICE_CORRECTION',
                amount: -100,
            });
            expect(result.success).toBe(false);
        });

        it('rejects when neither lines nor amount is provided for PRICE_CORRECTION', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Missing both lines and amount',
                noteType: 'PRICE_CORRECTION',
                // no lines, no amount
            });
            expect(result.success).toBe(false);
            const msg = result.error?.issues[0]?.message ?? '';
            expect(msg).toMatch(/lines.*required|amount.*required|line items.*required/i);
        });
    });

    // ── PRICE_CORRECTION: lines path still works ──────────────

    describe('PRICE_CORRECTION — with explicit lines', () => {
        it('accepts PRICE_CORRECTION with lines (backward compatible)', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Unit price adjustment',
                noteType: 'PRICE_CORRECTION',
                lines: singleLine,
            });
            expect(result.success).toBe(true);
        });

        it('accepts both lines and amount (lines take precedence — schema allows both)', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Has both',
                noteType: 'PRICE_CORRECTION',
                lines: singleLine,
                amount: 999,
            });
            expect(result.success).toBe(true);
        });
    });

    // ── FULL / PARTIAL: must have lines ──────────────────────

    describe('FULL / PARTIAL — lines required', () => {
        it('rejects FULL without lines', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Full reversal',
                noteType: 'FULL',
                amount: 80000, // amount alone is not enough for FULL
            });
            expect(result.success).toBe(false);
            const msg = result.error?.issues[0]?.message ?? '';
            expect(msg).toMatch(/line items.*required|FULL.*PARTIAL/i);
        });

        it('rejects PARTIAL without lines', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Partial reversal',
                noteType: 'PARTIAL',
                amount: 20000,
            });
            expect(result.success).toBe(false);
        });

        it('accepts FULL with lines', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Full reversal with lines',
                noteType: 'FULL',
                lines: singleLine,
            });
            expect(result.success).toBe(true);
        });

        it('accepts PARTIAL with lines', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Partial adjustment',
                noteType: 'PARTIAL',
                lines: singleLine,
            });
            expect(result.success).toBe(true);
        });
    });

    // ── General field validation ─────────────────────────────

    describe('field validation', () => {
        it('rejects non-UUID invoiceId', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: 'not-a-uuid',
                reason: 'Test',
                noteType: 'PRICE_CORRECTION',
                amount: 100,
            });
            expect(result.success).toBe(false);
        });

        it('rejects empty reason', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: '',
                noteType: 'PRICE_CORRECTION',
                amount: 100,
            });
            expect(result.success).toBe(false);
        });

        it('rejects unknown noteType', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Test',
                noteType: 'RETURN',   // invalid
                amount: 100,
            });
            expect(result.success).toBe(false);
        });

        it('accepts optional notes and returnGrnId fields', () => {
            const result = CreateSupplierCreditNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'With extras',
                noteType: 'PRICE_CORRECTION',
                amount: 500,
                notes: 'Internal note',
                returnGrnId: '22222222-2222-2222-2222-222222222222',
            });
            expect(result.success).toBe(true);
        });
    });
});

// ============================================================
// CreateSupplierDebitNoteSchema
// ============================================================

describe('CreateSupplierDebitNoteSchema', () => {

    // ── amount-only path ─────────────────────────────────────

    describe('amount-only (no lines)', () => {
        it('accepts valid amount without lines', () => {
            const result = CreateSupplierDebitNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Additional handling charges',
                amount: 2500,
            });
            expect(result.success).toBe(true);
        });

        it('rejects amount = 0', () => {
            const result = CreateSupplierDebitNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Zero charge',
                amount: 0,
            });
            expect(result.success).toBe(false);
        });

        it('rejects when neither lines nor amount provided', () => {
            const result = CreateSupplierDebitNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Missing everything',
            });
            expect(result.success).toBe(false);
            const msg = result.error?.issues[0]?.message ?? '';
            expect(msg).toMatch(/line items.*required|amount.*required|either/i);
        });
    });

    // ── lines path still works ──────────────────────────────

    describe('with explicit lines (backward compatible)', () => {
        it('accepts debit note with line items', () => {
            const result = CreateSupplierDebitNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Damage charges',
                lines: singleLine,
            });
            expect(result.success).toBe(true);
        });

        it('rejects lines array with zero items', () => {
            const result = CreateSupplierDebitNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Empty lines array',
                lines: [],
            });
            // Empty array: lines.min(1) fails — schema treats [] as "no lines", refine also fails
            expect(result.success).toBe(false);
        });
    });

    // ── field validation ────────────────────────────────────

    describe('field validation', () => {
        it('rejects non-UUID invoiceId', () => {
            const result = CreateSupplierDebitNoteSchema.safeParse({
                invoiceId: 'bad-id',
                reason: 'Test',
                amount: 100,
            });
            expect(result.success).toBe(false);
        });

        it('rejects empty reason', () => {
            const result = CreateSupplierDebitNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: '',
                amount: 100,
            });
            expect(result.success).toBe(false);
        });

        it('accepts optional notes field', () => {
            const result = CreateSupplierDebitNoteSchema.safeParse({
                invoiceId: validInvoiceId,
                reason: 'Extra charge',
                amount: 750,
                notes: 'Damaged packaging',
            });
            expect(result.success).toBe(true);
        });
    });
});
