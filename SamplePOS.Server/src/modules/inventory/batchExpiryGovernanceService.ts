/**
 * BatchExpiryGovernanceService
 *
 * SAP-style governance for batch expiry date corrections.
 * This service MUST only be called from the inventory module's
 * batch expiry endpoint. Do NOT export from index.ts or use elsewhere.
 *
 * Hard rules (any violation throws ValidationError):
 *   1. batch.remaining_quantity <= 0 → BLOCKED (no stock to correct)
 *   2. User lacks 'inventory.batch_expiry_edit' → BLOCKED
 *   3. reason is empty/whitespace → BLOCKED
 *   4. newExpiry is in the past (before today in business date) → BLOCKED
 *   5. newExpiry is identical to current expiry → BLOCKED (no-op)
 */

import { ValidationError, ForbiddenError } from '../../middleware/errorHandler.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import Decimal from 'decimal.js';

export interface BatchForGovernance {
    id: string;
    batch_number: string;
    remaining_quantity: string | number;
    expiry_date: string | null;
    product_name: string;
}

export interface GovernanceUserContext {
    id: string;
    fullName: string;
    permissions: Set<string>;
}

export interface ValidatedExpiryEdit {
    batchId: string;
    batchNumber: string;
    oldExpiryDate: string | null;
    newExpiryDate: string;
    userId: string;
    userName: string;
    reason: string;
}

/**
 * Validate a batch expiry date change request.
 * Throws ValidationError or ForbiddenError on any rule violation.
 * Returns a typed ValidatedExpiryEdit on success.
 *
 * @param batch    - The batch record from DB (must have remaining_quantity, expiry_date)
 * @param user     - The requesting user with their permission set
 * @param newExpiry - Proposed new expiry date as 'YYYY-MM-DD' string
 * @param reason   - Mandatory reason for the change
 */
export function validateExpiryEdit(
    batch: BatchForGovernance,
    user: GovernanceUserContext,
    newExpiry: string,
    reason: string
): ValidatedExpiryEdit {
    // Rule 1: Permission check
    if (!user.permissions.has('inventory.batch_expiry_edit')) {
        throw new ForbiddenError(
            `You do not have permission to edit batch expiry dates. ` +
            `Permission required: 'inventory.batch_expiry_edit'.`
        );
    }

    // Rule 2: Must have remaining stock
    const remainingQty = new Decimal(batch.remaining_quantity ?? 0);
    if (remainingQty.lte(0)) {
        throw new ValidationError(
            `Cannot edit expiry for batch ${batch.batch_number}: ` +
            `remaining quantity is ${remainingQty.toFixed(4)} (must be > 0).`
        );
    }

    // Rule 3: Reason must not be empty
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (trimmedReason.length === 0) {
        throw new ValidationError(
            'A reason is required when changing a batch expiry date.'
        );
    }

    // Rule 4: New expiry must not be in the past
    const today = getBusinessDate();          // returns 'YYYY-MM-DD'
    if (newExpiry < today) {
        throw new ValidationError(
            `New expiry date ${newExpiry} is in the past (today is ${today}). ` +
            `Expired batches cannot be re-activated through expiry correction.`
        );
    }

    // Rule 5: No-op check — new expiry must differ from current
    const currentExpiry = batch.expiry_date ?? null;
    if (currentExpiry === newExpiry) {
        throw new ValidationError(
            `New expiry date ${newExpiry} is the same as the current expiry date. No change needed.`
        );
    }

    // All rules passed
    return {
        batchId: batch.id,
        batchNumber: batch.batch_number,
        oldExpiryDate: currentExpiry,
        newExpiryDate: newExpiry,
        userId: user.id,
        userName: user.fullName,
        reason: trimmedReason,
    };
}
