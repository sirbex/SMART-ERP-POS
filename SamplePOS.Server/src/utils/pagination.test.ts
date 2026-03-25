/**
 * PaginationHelper Tests
 * 
 * Tests for query parsing, envelope construction, and SQL fragment generation.
 */

import { describe, it, expect } from '@jest/globals';
import { PaginationHelper } from './pagination.js';

describe('PaginationHelper', () => {
    // -----------------------------------------------------------------------
    // fromQuery
    // -----------------------------------------------------------------------
    describe('fromQuery', () => {
        it('should parse valid page and limit', () => {
            const result = PaginationHelper.fromQuery({ page: '2', limit: '20' });
            expect(result.page).toBe(2);
            expect(result.limit).toBe(20);
            expect(result.offset).toBe(20); // (2-1) * 20
        });

        it('should use defaults when no query params', () => {
            const result = PaginationHelper.fromQuery({});
            expect(result.page).toBe(1);
            expect(result.limit).toBe(50); // DEFAULT_PAGE_SIZE
            expect(result.offset).toBe(0);
        });

        it('should accept custom defaults', () => {
            const result = PaginationHelper.fromQuery({}, { page: 1, limit: 10 });
            expect(result.limit).toBe(10);
        });

        it('should clamp page to minimum 1', () => {
            const result = PaginationHelper.fromQuery({ page: '0', limit: '20' });
            expect(result.page).toBe(1);
        });

        it('should clamp negative page to default', () => {
            const result = PaginationHelper.fromQuery({ page: '-5', limit: '20' });
            expect(result.page).toBe(1);
        });

        it('should clamp limit to minimum 1', () => {
            const result = PaginationHelper.fromQuery({ page: '1', limit: '0' });
            expect(result.limit).toBe(1);
        });

        it('should clamp limit to MAX_PAGE_SIZE (500)', () => {
            const result = PaginationHelper.fromQuery({ page: '1', limit: '9999' });
            expect(result.limit).toBe(500);
        });

        it('should handle non-numeric page string', () => {
            const result = PaginationHelper.fromQuery({ page: 'abc', limit: '20' });
            expect(result.page).toBe(1); // Falls back to default
        });

        it('should handle non-numeric limit string', () => {
            const result = PaginationHelper.fromQuery({ page: '1', limit: 'xyz' });
            expect(result.limit).toBe(50); // Falls back to DEFAULT_PAGE_SIZE
        });

        it('should calculate offset correctly for page 5', () => {
            const result = PaginationHelper.fromQuery({ page: '5', limit: '25' });
            expect(result.offset).toBe(100); // (5-1) * 25
        });
    });

    // -----------------------------------------------------------------------
    // envelope
    // -----------------------------------------------------------------------
    describe('envelope', () => {
        it('should create pagination envelope', () => {
            const params = { page: 1, limit: 20, offset: 0 };
            const envelope = PaginationHelper.envelope(params, 100);

            expect(envelope.page).toBe(1);
            expect(envelope.limit).toBe(20);
            expect(envelope.total).toBe(100);
            expect(envelope.totalPages).toBe(5); // 100 / 20
        });

        it('should round totalPages up', () => {
            const params = { page: 1, limit: 20, offset: 0 };
            const envelope = PaginationHelper.envelope(params, 101);

            expect(envelope.totalPages).toBe(6); // ceil(101/20)
        });

        it('should handle zero total', () => {
            const params = { page: 1, limit: 20, offset: 0 };
            const envelope = PaginationHelper.envelope(params, 0);

            expect(envelope.totalPages).toBe(0);
        });

        it('should handle single page', () => {
            const params = { page: 1, limit: 50, offset: 0 };
            const envelope = PaginationHelper.envelope(params, 10);

            expect(envelope.totalPages).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // sql
    // -----------------------------------------------------------------------
    describe('sql', () => {
        it('should generate SQL fragment with correct param indices', () => {
            const params = { page: 2, limit: 20, offset: 20 };
            const result = PaginationHelper.sql(params, 3);

            expect(result.limitClause).toContain('$3');
            expect(result.limitClause).toContain('$4');
            expect(result.params).toEqual([20, 20]); // limit, offset
            expect(result.nextParamIndex).toBe(5);
        });

        it('should generate SQL fragment starting at $1', () => {
            const params = { page: 1, limit: 50, offset: 0 };
            const result = PaginationHelper.sql(params, 1);

            expect(result.limitClause).toContain('$1');
            expect(result.limitClause).toContain('$2');
            expect(result.params).toEqual([50, 0]);
            expect(result.nextParamIndex).toBe(3);
        });
    });
});
