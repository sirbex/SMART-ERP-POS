/**
 * Unit tests for BatchExpiryGovernanceService
 *
 * Tests all 5 hard rules defined in validateExpiryEdit().
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Mock dateRange so getBusinessDate() returns a controllable value ──────────
jest.unstable_mockModule('../../utils/dateRange.js', () => ({
    getBusinessDate: jest.fn(() => '2025-06-15'),
}));

// ── Dynamic import AFTER mocking ──────────────────────────────────────────────
const { validateExpiryEdit } = await import('./batchExpiryGovernanceService.js');
import type { BatchForGovernance, GovernanceUserContext } from './batchExpiryGovernanceService.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeBatch(overrides: Partial<BatchForGovernance> = {}): BatchForGovernance {
    return {
        id: 'batch-uuid-001',
        batch_number: 'BN-2025-0001',
        remaining_quantity: '10.0000',
        expiry_date: '2025-12-31',
        product_name: 'Paracetamol 500mg',
        ...overrides,
    };
}

function makeUser(overrides: Partial<GovernanceUserContext> = {}): GovernanceUserContext {
    return {
        id: 'user-uuid-001',
        fullName: 'Test Admin',
        permissions: new Set(['inventory.batch_expiry_edit']),
        ...overrides,
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('validateExpiryEdit()', () => {
    describe('Rule 1 — Permission check', () => {
        it('throws ForbiddenError when user lacks inventory.batch_expiry_edit', () => {
            const user = makeUser({ permissions: new Set(['inventory.read']) });
            expect(() => validateExpiryEdit(makeBatch(), user, '2026-01-15', 'Supplier correction'))
                .toThrow('do not have permission');
        });

        it('throws ForbiddenError when user has empty permission set', () => {
            const user = makeUser({ permissions: new Set() });
            expect(() => validateExpiryEdit(makeBatch(), user, '2026-01-15', 'Supplier correction'))
                .toThrow('do not have permission');
        });
    });

    describe('Rule 2 — Remaining quantity must be > 0', () => {
        it('throws ValidationError when remaining_quantity is 0', () => {
            const batch = makeBatch({ remaining_quantity: '0' });
            expect(() => validateExpiryEdit(batch, makeUser(), '2026-01-15', 'Supplier correction'))
                .toThrow('remaining quantity');
        });

        it('throws ValidationError when remaining_quantity is exactly 0.0000', () => {
            const batch = makeBatch({ remaining_quantity: '0.0000' });
            expect(() => validateExpiryEdit(batch, makeUser(), '2026-01-15', 'Supplier correction'))
                .toThrow('remaining quantity');
        });

        it('throws ValidationError when remaining_quantity is negative', () => {
            const batch = makeBatch({ remaining_quantity: '-5.5000' });
            expect(() => validateExpiryEdit(batch, makeUser(), '2026-01-15', 'Supplier correction'))
                .toThrow('remaining quantity');
        });

        it('throws ValidationError when remaining_quantity is numeric 0', () => {
            const batch = makeBatch({ remaining_quantity: 0 });
            expect(() => validateExpiryEdit(batch, makeUser(), '2026-01-15', 'Supplier correction'))
                .toThrow('remaining quantity');
        });
    });

    describe('Rule 3 — Reason must not be empty', () => {
        it('throws ValidationError when reason is empty string', () => {
            expect(() => validateExpiryEdit(makeBatch(), makeUser(), '2026-01-15', ''))
                .toThrow('reason is required');
        });

        it('throws ValidationError when reason is whitespace only', () => {
            expect(() => validateExpiryEdit(makeBatch(), makeUser(), '2026-01-15', '   '))
                .toThrow('reason is required');
        });

        it('throws ValidationError when reason is tab/newline only', () => {
            expect(() => validateExpiryEdit(makeBatch(), makeUser(), '2026-01-15', '\t\n'))
                .toThrow('reason is required');
        });
    });

    describe('Rule 4 — New expiry must not be in the past', () => {
        // getBusinessDate() is mocked to return '2025-06-15'

        it('throws ValidationError when newExpiry is yesterday (2025-06-14)', () => {
            expect(() => validateExpiryEdit(makeBatch(), makeUser(), '2025-06-14', 'Supplier correction'))
                .toThrow('in the past');
        });

        it('throws ValidationError when newExpiry is well in the past (2024-01-01)', () => {
            expect(() => validateExpiryEdit(makeBatch(), makeUser(), '2024-01-01', 'Supplier correction'))
                .toThrow('in the past');
        });

        it('does NOT throw for newExpiry equal to today (2025-06-15)', () => {
            // Today is allowed — it's not in the past
            // (batch.expiry_date is '2025-12-31' so no-op rule won't fire)
            const batch = makeBatch({ expiry_date: '2025-07-01' });
            expect(() => validateExpiryEdit(batch, makeUser(), '2025-06-15', 'Supplier correction'))
                .not.toThrow();
        });
    });

    describe('Rule 5 — New expiry must differ from current', () => {
        it('throws ValidationError when newExpiry equals current expiry_date', () => {
            const batch = makeBatch({ expiry_date: '2026-03-31' });
            expect(() => validateExpiryEdit(batch, makeUser(), '2026-03-31', 'Supplier correction'))
                .toThrow('same as the current expiry');
        });
    });

    describe('Happy path — all rules pass', () => {
        it('returns ValidatedExpiryEdit with correct fields', () => {
            const batch = makeBatch({
                id: 'batch-uuid-999',
                batch_number: 'BN-2025-0099',
                remaining_quantity: '25.5000',
                expiry_date: '2026-06-30',
                product_name: 'Amoxicillin 250mg',
            });
            const user = makeUser({
                id: 'user-uuid-999',
                fullName: 'Jane Admin',
                permissions: new Set(['inventory.batch_expiry_edit', 'inventory.read']),
            });

            const result = validateExpiryEdit(batch, user, '2027-03-31', '  Supplier correction letter ref SC-2025-001  ');

            expect(result).toEqual({
                batchId: 'batch-uuid-999',
                batchNumber: 'BN-2025-0099',
                oldExpiryDate: '2026-06-30',
                newExpiryDate: '2027-03-31',
                userId: 'user-uuid-999',
                userName: 'Jane Admin',
                reason: 'Supplier correction letter ref SC-2025-001',  // trimmed
            });
        });

        it('returns ValidatedExpiryEdit when batch has null expiry_date (no previous expiry)', () => {
            const batch = makeBatch({ expiry_date: null });
            const result = validateExpiryEdit(batch, makeUser(), '2027-01-01', 'Initial expiry assignment');

            expect(result.oldExpiryDate).toBeNull();
            expect(result.newExpiryDate).toBe('2027-01-01');
        });

        it('trims whitespace from reason in returned result', () => {
            const result = validateExpiryEdit(makeBatch(), makeUser(), '2027-01-01', '  extra spaces  ');
            expect(result.reason).toBe('extra spaces');
        });
    });
});
