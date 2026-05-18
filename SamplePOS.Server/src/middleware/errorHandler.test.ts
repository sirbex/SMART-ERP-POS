/**
 * Error Handler Middleware Tests
 * 
 * Tests for AppError hierarchy, asyncHandler, errorHandler, and notFoundHandler.
 */

import { jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import {
    AppError,
    NotFoundError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    BusinessError,
    asyncHandler,
    errorHandler,
} from './errorHandler.js';
import { PostingGovernanceError } from '../services/postingGovernanceService.js';

describe('Error Classes', () => {
    describe('AppError', () => {
        it('should create with statusCode and message', () => {
            const error = new AppError(400, 'Bad Request');
            expect(error.statusCode).toBe(400);
            expect(error.message).toBe('Bad Request');
            expect(error.isOperational).toBe(true);
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(AppError);
        });

        it('should be marked as non-operational when specified', () => {
            const error = new AppError(500, 'System error', false);
            expect(error.isOperational).toBe(false);
        });

        it('should have a stack trace', () => {
            const error = new AppError(500, 'test');
            expect(error.stack).toBeDefined();
        });
    });

    describe('NotFoundError', () => {
        it('should create with 404 status', () => {
            const error = new NotFoundError('Product');
            expect(error.statusCode).toBe(404);
            expect(error.message).toBe('Product not found');
            expect(error).toBeInstanceOf(AppError);
        });
    });

    describe('ValidationError', () => {
        it('should create with 400 status', () => {
            const error = new ValidationError('Invalid quantity');
            expect(error.statusCode).toBe(400);
            expect(error.message).toBe('Invalid quantity');
        });
    });

    describe('UnauthorizedError', () => {
        it('should create with 401 status and default message', () => {
            const error = new UnauthorizedError();
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe('Unauthorized');
        });

        it('should accept custom message', () => {
            const error = new UnauthorizedError('Token expired');
            expect(error.message).toBe('Token expired');
        });
    });

    describe('ForbiddenError', () => {
        it('should create with 403 status', () => {
            const error = new ForbiddenError();
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe('Forbidden');
        });

        it('should accept custom message', () => {
            const error = new ForbiddenError('Insufficient permissions');
            expect(error.message).toBe('Insufficient permissions');
        });
    });

    describe('ConflictError', () => {
        it('should create with 409 status', () => {
            const error = new ConflictError('Duplicate entry');
            expect(error.statusCode).toBe(409);
            expect(error.message).toBe('Duplicate entry');
        });
    });
});

describe('asyncHandler', () => {
    it('should pass successful handler through', async () => {
        const handler = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
        const wrapped = asyncHandler(handler as Parameters<typeof asyncHandler>[0]);

        const req = {} as unknown as Request;
        const res = {} as unknown as Response;
        const next = jest.fn() as unknown as NextFunction;

        await wrapped(req, res, next);

        expect(handler).toHaveBeenCalledWith(req, res, next);
        expect(next as jest.Mock).not.toHaveBeenCalled();
    });

    it('should call next with error when handler throws', async () => {
        const error = new Error('test error');
        const handler = jest.fn<() => Promise<unknown>>().mockRejectedValue(error);
        const wrapped = asyncHandler(handler as Parameters<typeof asyncHandler>[0]);

        const req = {} as unknown as Request;
        const res = {} as unknown as Response;
        const next = jest.fn() as unknown as NextFunction;

        await wrapped(req, res, next);

        expect(next as jest.Mock).toHaveBeenCalledWith(error);
    });

    it('should handle AppError thrown by handler', async () => {
        const error = new NotFoundError('Product');
        const handler = jest.fn<() => Promise<unknown>>().mockRejectedValue(error);
        const wrapped = asyncHandler(handler as Parameters<typeof asyncHandler>[0]);

        const req = {} as unknown as Request;
        const res = {} as unknown as Response;
        const next = jest.fn() as unknown as NextFunction;

        await wrapped(req, res, next);

        expect(next as jest.Mock).toHaveBeenCalledWith(error);
        const passedError = (next as jest.Mock).mock.calls[0][0] as AppError;
        expect(passedError.statusCode).toBe(404);
    });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRes() {
    const json = jest.fn<() => Response>();
    const status = jest.fn<() => { json: typeof json }>().mockReturnValue({ json });
    const res = {
        status,
        json,
        headersSent: false,
    } as unknown as Response;
    return { res, status, json };
}

function makeReq(): Request {
    return { requestId: 'test-req-id' } as unknown as Request;
}

// ── PostingGovernanceError class ───────────────────────────────────────────

describe('PostingGovernanceError', () => {
    it('should store code and context', () => {
        const err = new PostingGovernanceError(
            'Account 1000 is debit-normal.',
            'GOV_RULE_A_NORMAL_BALANCE',
            { accountCode: '1000' }
        );
        expect(err.code).toBe('GOV_RULE_A_NORMAL_BALANCE');
        expect(err.context).toEqual({ accountCode: '1000' });
        expect(err).toBeInstanceOf(Error);
    });

    it('should prefix code into message so jest toThrow assertions work', () => {
        const err = new PostingGovernanceError('Human message.', 'GOV_RULE_X', {});
        expect(err.message).toContain('[GOV_RULE_X]');
        expect(err.message).toContain('Human message.');
    });
});

// ── errorHandler middleware ────────────────────────────────────────────────

describe('errorHandler middleware', () => {
    describe('PostingGovernanceError', () => {
        it('should respond 400 with the GOV_RULE error_code', () => {
            const err = new PostingGovernanceError(
                'Account 1000 (Cash) is debit-normal. Manual credit not permitted.',
                'GOV_RULE_A_NORMAL_BALANCE',
                { accountCode: '1000', source: 'MANUAL' }
            );
            const { res, status, json } = makeRes();

            errorHandler(err, makeReq(), res, jest.fn() as unknown as NextFunction);

            expect(status).toHaveBeenCalledWith(400);
            const payload = (json as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
            expect(payload.success).toBe(false);
            expect(payload.error_code).toBe('GOV_RULE_A_NORMAL_BALANCE');
        });

        it('should strip the [CODE] prefix from the error field', () => {
            const err = new PostingGovernanceError(
                'Debit-normal account violated.',
                'GOV_RULE_A_NORMAL_BALANCE',
                {}
            );
            const { res, json } = makeRes();

            errorHandler(err, makeReq(), res, jest.fn() as unknown as NextFunction);

            const payload = (json as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
            // error field must NOT contain the [CODE] prefix
            expect(payload.error as string).not.toMatch(/^\[/);
            expect(payload.error as string).toBe('Debit-normal account violated.');
        });

        it('should set details.reason to the clean human-readable message', () => {
            const err = new PostingGovernanceError(
                'Cash account may not be credited.',
                'GOV_RULE_D_CASH_CREDIT',
                { accountCode: '1001' }
            );
            const { res, json } = makeRes();

            errorHandler(err, makeReq(), res, jest.fn() as unknown as NextFunction);

            const payload = (json as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
            const details = payload.details as Record<string, unknown>;
            expect(details.reason).toBe('Cash account may not be credited.');
        });

        it('should merge the context into details alongside reason', () => {
            const err = new PostingGovernanceError(
                'Source not allowed.',
                'GOV_RULE_B_SOURCE_NOT_ALLOWED',
                { accountCode: '2000', allowedSources: ['PURCHASE'] }
            );
            const { res, json } = makeRes();

            errorHandler(err, makeReq(), res, jest.fn() as unknown as NextFunction);

            const payload = (json as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
            const details = payload.details as Record<string, unknown>;
            expect(details.accountCode).toBe('2000');
            expect(details.allowedSources).toEqual(['PURCHASE']);
            expect(details.reason).toBe('Source not allowed.');
        });
    });

    describe('BusinessError', () => {
        it('should respond with the business error statusCode and error_code', () => {
            const err = new BusinessError('Duplicate entry', 'ERR_DUPLICATE_001', { field: 'email' });
            const { res, status, json } = makeRes();

            errorHandler(err, makeReq(), res, jest.fn() as unknown as NextFunction);

            expect(status).toHaveBeenCalledWith(400);
            const payload = (json as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
            expect(payload.success).toBe(false);
            expect(payload.error_code).toBe('ERR_DUPLICATE_001');
            expect((payload.details as Record<string, unknown>).field).toBe('email');
        });
    });
});
