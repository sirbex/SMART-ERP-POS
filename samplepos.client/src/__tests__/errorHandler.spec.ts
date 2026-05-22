/**
 * Error Handler Utility Tests
 *
 * Covers:
 *  - HandledApiError class
 *  - handleApiError skips toast when error is HandledApiError
 *  - formatByErrorCode routes GOV_RULE_* / ACC_RULE_* / INV_RULE_* correctly
 *    (tested via getStructuredErrorMessage which is silent)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosError } from 'axios';

// ── Mock react-hot-toast before importing errorHandler ───────────────────────
// vi.hoisted ensures the spy is available when the mock factory is hoisted to
// the top of the file by vitest's transform.
const toastErrorSpy = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({
    default: {
        error: toastErrorSpy,
        success: vi.fn(),
    },
}));

import {
    HandledApiError,
    handleApiError,
    getStructuredErrorMessage,
    parseApiError,
} from '../utils/errorHandler';

// ── Helper: build a minimal AxiosError-shaped object ─────────────────────────
function makeAxiosError(
    status: number,
    data: Record<string, unknown>
): AxiosError {
    return {
        isAxiosError: true,
        response: {
            status,
            data,
            headers: {},
            config: {} as AxiosError['config'],
            statusText: 'Error',
        },
        config: {} as AxiosError['config'],
        message: 'Request failed',
        name: 'AxiosError',
        toJSON: () => ({}),
    } as unknown as AxiosError;
}

// ─────────────────────────────────────────────────────────────────────────────
// HandledApiError class
// ─────────────────────────────────────────────────────────────────────────────

describe('HandledApiError', () => {
    it('should extend Error', () => {
        const err = new HandledApiError('already toasted');
        expect(err).toBeInstanceOf(Error);
    });

    it('should have isHandled = true', () => {
        const err = new HandledApiError('already toasted');
        expect(err.isHandled).toBe(true);
    });

    it('should carry the message', () => {
        const err = new HandledApiError('Rule violation reason');
        expect(err.message).toBe('Rule violation reason');
    });

    it('should have name HandledApiError', () => {
        const err = new HandledApiError('test');
        expect(err.name).toBe('HandledApiError');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleApiError — HandledApiError must not re-toast
// ─────────────────────────────────────────────────────────────────────────────

describe('handleApiError — HandledApiError suppresses duplicate toast', () => {
    beforeEach(() => toastErrorSpy.mockClear());

    it('should return the error message without calling toast', () => {
        const err = new HandledApiError('Cash account may not be credited.');
        const msg = handleApiError(err);

        expect(msg).toBe('Cash account may not be credited.');
        expect(toastErrorSpy).not.toHaveBeenCalled();
    });

    it('should also suppress toast when silent:true is passed', () => {
        const err = new HandledApiError('Rule fired');
        handleApiError(err, { silent: true });
        expect(toastErrorSpy).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleApiError — normal errors still toast
// ─────────────────────────────────────────────────────────────────────────────

describe('handleApiError — non-HandledApiError still toasts', () => {
    beforeEach(() => toastErrorSpy.mockClear());

    it('should call toast.error for a plain Error', () => {
        handleApiError(new Error('Something broke'));
        expect(toastErrorSpy).toHaveBeenCalledOnce();
    });

    it('should not call toast when silent:true', () => {
        handleApiError(new Error('Something broke'), { silent: true });
        expect(toastErrorSpy).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GOV_RULE_* routing — uses details.reason when present
// ─────────────────────────────────────────────────────────────────────────────

describe('getStructuredErrorMessage — GOV_RULE_* errors', () => {
    it('should return details.reason for a GOV_RULE violation', () => {
        const axError = makeAxiosError(400, {
            success: false,
            error: '[GOV_RULE_A_NORMAL_BALANCE] Account 1000 (Cash) is debit-normal.',
            error_code: 'GOV_RULE_A_NORMAL_BALANCE',
            details: {
                accountCode: '1000',
                reason: 'Account 1000 (Cash) is debit-normal.',
            },
        });

        const msg = getStructuredErrorMessage(axError);
        expect(msg).toBe('Account 1000 (Cash) is debit-normal.');
    });

    it('should fall back to error field when details.reason is absent', () => {
        const axError = makeAxiosError(400, {
            success: false,
            error: 'Cash account may not be credited.',
            error_code: 'GOV_RULE_D_CASH_CREDIT',
            details: { accountCode: '1001' },
        });

        const msg = getStructuredErrorMessage(axError);
        expect(msg).toBe('Cash account may not be credited.');
    });

    it('should fall back to error field when details is absent', () => {
        const axError = makeAxiosError(400, {
            success: false,
            error: 'Inventory account is restricted.',
            error_code: 'GOV_RULE_H_INVENTORY_STRICT',
        });

        const msg = getStructuredErrorMessage(axError);
        expect(msg).toBe('Inventory account is restricted.');
    });

    it('should handle GOV_RULE_B_SOURCE_NOT_ALLOWED', () => {
        const axError = makeAxiosError(400, {
            success: false,
            error: 'Source MANUAL not allowed for this account.',
            error_code: 'GOV_RULE_B_SOURCE_NOT_ALLOWED',
            details: {
                accountCode: '2000',
                reason: 'Source MANUAL not allowed for this account.',
                allowedSources: ['PURCHASE'],
            },
        });

        const msg = getStructuredErrorMessage(axError);
        expect(msg).toBe('Source MANUAL not allowed for this account.');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ACC_RULE_* routing
// ─────────────────────────────────────────────────────────────────────────────

describe('getStructuredErrorMessage — ACC_RULE_* errors', () => {
    it('should return details.reason when present', () => {
        const axError = makeAxiosError(400, {
            success: false,
            error: 'Period is closed.',
            error_code: 'ACC_RULE_PERIOD_CLOSED',
            details: { reason: 'The accounting period is closed for posting.' },
        });

        const msg = getStructuredErrorMessage(axError);
        expect(msg).toBe('The accounting period is closed for posting.');
    });

    it('should fall back to error field when details.reason absent', () => {
        const axError = makeAxiosError(400, {
            success: false,
            error: 'Account balance mismatch.',
            error_code: 'ACC_RULE_BALANCE_MISMATCH',
        });

        const msg = getStructuredErrorMessage(axError);
        expect(msg).toBe('Account balance mismatch.');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// INV_RULE_* routing
// ─────────────────────────────────────────────────────────────────────────────

describe('getStructuredErrorMessage — INV_RULE_* errors', () => {
    it('should return details.reason when present', () => {
        const axError = makeAxiosError(400, {
            success: false,
            error: 'Negative stock not permitted.',
            error_code: 'INV_RULE_NO_NEGATIVE_STOCK',
            details: { reason: 'Stock cannot go below zero for this product.' },
        });

        const msg = getStructuredErrorMessage(axError);
        expect(msg).toBe('Stock cannot go below zero for this product.');
    });

    it('should fall back to error field when details.reason absent', () => {
        const axError = makeAxiosError(400, {
            success: false,
            error: 'Batch already consumed.',
            error_code: 'INV_RULE_BATCH_CONSUMED',
        });

        const msg = getStructuredErrorMessage(axError);
        expect(msg).toBe('Batch already consumed.');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseApiError — base contract (GOV_RULE_* error structure)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseApiError — GOV_RULE_* error structure', () => {
    it('should extract error_code and details from an axios error', () => {
        const axError = makeAxiosError(400, {
            success: false,
            error: 'Cash account may not be credited.',
            error_code: 'GOV_RULE_D_CASH_CREDIT',
            details: { reason: 'Cash account may not be credited.', accountCode: '1001' },
        });

        const parsed = parseApiError(axError);
        expect(parsed.errorCode).toBe('GOV_RULE_D_CASH_CREDIT');
        expect(parsed.status).toBe(400);
        expect(parsed.message).toBe('Cash account may not be credited.');
        expect(parsed.details?.reason).toBe('Cash account may not be credited.');
    });
});
