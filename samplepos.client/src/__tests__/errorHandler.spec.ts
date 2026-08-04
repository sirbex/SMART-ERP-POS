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

// ── Mock react-hot-toast / sonner before importing errorHandler ─────────────
// vi.hoisted ensures the spy is available when the mock factory is hoisted to
// the top of the file by vitest's transform.
const toastErrorSpy = vi.hoisted(() => vi.fn());
const sonnerErrorSpy = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({
    default: {
        error: toastErrorSpy,
        success: vi.fn(),
    },
}));
vi.mock('sonner', () => ({
    toast: {
        error: sonnerErrorSpy,
        success: vi.fn(),
    },
}));

import {
    HandledApiError,
    handleApiError,
    getStructuredErrorMessage,
    parseApiError,
    markApiErrorNotified,
    shouldSuppressApiErrorToast,
    installGlobalApiToastDedupe,
    resetApiErrorToastDedupeForTests,
    wrapToastErrorWithApiDedupe,
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
    beforeEach(() => {
        toastErrorSpy.mockClear();
        resetApiErrorToastDedupeForTests();
    });

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
// Global toast.error dedupe — page re-toasts after interceptor are no-ops
// ─────────────────────────────────────────────────────────────────────────────

describe('global API toast dedupe', () => {
    beforeEach(() => {
        toastErrorSpy.mockClear();
        resetApiErrorToastDedupeForTests();
        installGlobalApiToastDedupe();
    });

    it('suppresses underlying display after markApiErrorNotified (pure wrap)', () => {
        const msg =
            'No active recipe for this product. Add ingredient lines manually or define a restaurant recipe first.';
        markApiErrorNotified(msg, 'Invalid request');
        expect(shouldSuppressApiErrorToast(msg)).toBe(true);

        // Spy.calls still increment if we call toast.error — measure *surface/display* via pure wrap
        const displayed: string[] = [];
        const display = wrapToastErrorWithApiDedupe((m) => {
            displayed.push(String(m));
        });
        display(msg);
        display(msg);
        expect(displayed).toEqual([]);
    });

    it('still allows toast.error for a different (unmarked) message via pure wrap', () => {
        markApiErrorNotified('Other failure');
        const displayed: string[] = [];
        const display = wrapToastErrorWithApiDedupe((m) => {
            displayed.push(String(m));
        });
        display('Select a finished product');
        expect(displayed).toEqual(['Select a finished product']);
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
// HTTP 403 — never surface Axios status-code text
// ─────────────────────────────────────────────────────────────────────────────

describe('friendly 403 / permission errors', () => {
    it('maps Insufficient permissions to Access denied copy', async () => {
        const { ACCESS_DENIED_MESSAGE, friendlyHttpErrorMessage } = await import('../utils/errorHandler');
        expect(friendlyHttpErrorMessage(403, 'Insufficient permissions')).toBe(ACCESS_DENIED_MESSAGE);
        expect(friendlyHttpErrorMessage(undefined, 'Request failed with status code 403')).toBe(
            ACCESS_DENIED_MESSAGE
        );
    });

    it('parseApiError never returns Request failed with status code 403', () => {
        const axError = makeAxiosError(403, {
            success: false,
            error: 'Insufficient permissions',
        });
        const parsed = parseApiError(axError);
        expect(parsed.message).not.toMatch(/status code/i);
        expect(parsed.message).toMatch(/permission/i);
    });

    it('handleApiError skips toast for HandledApiError', () => {
        toastErrorSpy.mockClear();
        const handled = new HandledApiError('You do not have permission to perform this action.');
        handleApiError(handled);
        expect(toastErrorSpy).not.toHaveBeenCalled();
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
