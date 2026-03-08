/**
 * Optimistic Concurrency Control (OCC) Utility
 *
 * Provides helpers for version-based conflict detection.
 * Every row carries an integer `version` column (default 1).
 *
 * ── Flow ──
 * 1. Client GETs a record → response includes `version`.
 * 2. Client PUTs/PATCHes with `version` in the body.
 * 3. Repository UPDATE adds:
 *      SET version = version + 1
 *      WHERE id = $1 AND version = $2       ← only if caller supplied version
 * 4. If rowCount = 0:
 *      a) Row does not exist, OR
 *      b) Version mismatch (concurrent write).
 *    → Throw ConflictError (409).
 *
 * When version is omitted (legacy callers), the WHERE clause
 * does NOT include a version check — backward compatible.
 */

import { ConflictError } from '../middleware/errorHandler.js';

/**
 * Assert that an UPDATE affected exactly one row.
 * Throws ConflictError when the row was modified by another transaction.
 *
 * @param rowCount - result.rowCount from pg
 * @param entity  - Human-readable entity name (e.g. "Product", "Customer")
 * @param id      - The record identifier (for the error message)
 */
export function assertRowUpdated(
    rowCount: number | null,
    entity: string,
    id: string,
): void {
    if (rowCount === null || rowCount === 0) {
        throw new ConflictError(
            `${entity} ${id} was modified by another user. Please refresh and try again.`,
        );
    }
}

/**
 * Build the version fragment for a parameterized UPDATE.
 *
 * Returns:
 * - `setClauses`  – array with `"version = version + 1"` (always)
 * - `whereClauses` – array with `"version = $N"` (only if version supplied)
 * - `params`       – parameter values to append
 * - `nextIdx`      – next available parameter index
 *
 * @param startIdx  – current parameter index ($N)
 * @param version   – version from the client (undefined = skip check)
 */
export function versionClauses(
    startIdx: number,
    version?: number,
): {
    setClauses: string[];
    whereClauses: string[];
    params: unknown[];
    nextIdx: number;
} {
    const setClauses = ['version = version + 1'];

    if (version !== undefined) {
        return {
            setClauses,
            whereClauses: [`version = $${startIdx}`],
            params: [version],
            nextIdx: startIdx + 1,
        };
    }

    return {
        setClauses,
        whereClauses: [],
        params: [],
        nextIdx: startIdx,
    };
}
