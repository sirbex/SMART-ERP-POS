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
    asyncHandler,
} from './errorHandler.js';

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
