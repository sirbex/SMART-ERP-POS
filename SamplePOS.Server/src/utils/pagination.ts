/**
 * Pagination utility — single source of truth for offset/limit parsing,
 * clamping, and response envelope construction.
 *
 * Usage in controllers:
 *   const pg = PaginationHelper.fromQuery(req.query);
 *   // pass pg.page, pg.limit, pg.offset to repository
 *   const envelope = PaginationHelper.envelope(pg, totalRows);
 *
 * Usage in repositories (SQL fragment):
 *   const { limitClause, params } = PaginationHelper.sql(pg, existingParamIndex);
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed and clamped pagination parameters */
export interface PaginationParams {
    /** Current page (1-based, always >= 1) */
    page: number;
    /** Items per page (clamped to 1..MAX_PAGE_SIZE) */
    limit: number;
    /** SQL offset derived from page & limit */
    offset: number;
}

/** Standard pagination envelope returned to the client */
export interface PaginationEnvelope {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

/** Result from sql() helper — fragment + positional params */
export interface PaginationSqlFragment {
    /** e.g. ` LIMIT $3 OFFSET $4` */
    limitClause: string;
    /** The two positional parameter values [limit, offset] */
    params: [number, number];
    /** The next available parameter index after appending limit & offset */
    nextParamIndex: number;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

export class PaginationHelper {
    /**
     * Parse page/limit from an Express-style query object.
     * Accepts `{ page?: string|number; limit?: string|number }`.
     * Falls back to DEFAULT_PAGE_SIZE when limit is missing/invalid.
     * Clamps limit to [1, MAX_PAGE_SIZE].
     */
    static fromQuery(
        query: Record<string, string | string[] | undefined>,
        defaults?: { page?: number; limit?: number },
    ): PaginationParams {
        const defaultLimit = defaults?.limit ?? DEFAULT_PAGE_SIZE;
        const defaultPage = defaults?.page ?? 1;

        const rawPage = typeof query.page === 'string' ? parseInt(query.page, 10) : defaultPage;
        const rawLimit = typeof query.limit === 'string' ? parseInt(query.limit, 10) : defaultLimit;

        const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : defaultPage;
        const limit = Number.isFinite(rawLimit)
            ? Math.min(Math.max(rawLimit, 1), MAX_PAGE_SIZE)
            : defaultLimit;

        return { page, limit, offset: (page - 1) * limit };
    }

    /**
     * Build the standard pagination envelope from parsed params + a total row
     * count (usually from a separate COUNT(*) query).
     */
    static envelope(params: PaginationParams, total: number): PaginationEnvelope {
        return {
            page: params.page,
            limit: params.limit,
            total,
            totalPages: total > 0 ? Math.ceil(total / params.limit) : 0,
        };
    }

    /**
     * Generate a SQL `LIMIT $n OFFSET $n+1` fragment with matching params.
     *
     * @param params  Parsed pagination params
     * @param paramIndex  The *next* available `$n` positional param index (1-based)
     * @returns `{ limitClause, params, nextParamIndex }`
     */
    static sql(
        params: PaginationParams,
        paramIndex: number,
    ): PaginationSqlFragment {
        return {
            limitClause: ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            params: [params.limit, params.offset],
            nextParamIndex: paramIndex + 2,
        };
    }
}

export default PaginationHelper;
